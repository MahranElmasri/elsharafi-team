-- T3 Absence days, notes, audit (R2, R4, R20)
begin;
select plan(17);
-- The switches can be changed in the app; the tests assume all on (rolled back at the end).
update public.app_settings set team_calendar = true, half_days = true, substitutes = true, au_tracking = true;

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'admin@example.org',
   '{"username":"admin","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'teil@example.org',
   '{"username":"teil","full_name":"Teil Zeit","team":"arbeiter","workdays":[1,2,4],"start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000b3', 'andere@example.org',
   '{"username":"andere","full_name":"Andere Person","team":"arbeiter","start_date":"2020-01-01"}', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

-- Working-day rule
select throws_ok($$select set_absence('00000000-0000-0000-0000-0000000000b2', '2026-11-14', 'sick')$$,
  'P0001', 'Teil Zeit arbeitet am 14.11.2026 nicht.', 'a Saturday is refused');
select throws_ok($$select set_absence('00000000-0000-0000-0000-0000000000b2', '2026-11-11', 'sick')$$,
  'P0001', 'Teil Zeit arbeitet am 11.11.2026 nicht.', 'a non-working weekday is refused');
select throws_ok($$select set_absence('00000000-0000-0000-0000-0000000000b2', '2026-12-25', 'sick')$$,
  'P0001', 'Der 25.12.2026 ist ein Feiertag. An Feiertagen wird nichts eingetragen.', 'a holiday is refused');

-- Grid click cycle: X, then U on the same day, then removed
select is((select status from set_absence('00000000-0000-0000-0000-0000000000b2', '2026-11-10', 'sick')),
  'approved', 'the admin enters X, approved directly');
select is((select type from set_absence('00000000-0000-0000-0000-0000000000b2', '2026-11-10', 'vacation')),
  'vacation', 'clicking again turns it into U');
select is((select count(*)::int from absence_days where user_id = '00000000-0000-0000-0000-0000000000b2'),
  1, 'still one entry for that day');
select is((select amount from set_absence('00000000-0000-0000-0000-0000000000b2', '2026-11-12', 'vacation', 'am')),
  0.5::numeric, 'a half day counts 0.5');
select lives_ok($$select set_absence('00000000-0000-0000-0000-0000000000b2', '2026-11-12', null)$$, 'removing works');
select is((select count(*)::int from absence_days where day = '2026-11-12'), 0, 'the entry is gone');

-- Audit
select ok((select count(*) from audit_log where table_name = 'absence_days'
           and row_key = '00000000-0000-0000-0000-0000000000b2|2026-11-10'
           and actor = '00000000-0000-0000-0000-0000000000b1') = 2,
  'insert and update are audit-logged with the admin as actor');

-- Notes
select lives_ok($$select set_note('00000000-0000-0000-0000-0000000000b2', '2026-11-10', '  AU per Post  ')$$, 'admin saves a note');
select is((select note from day_notes where day = '2026-11-10'), 'AU per Post', 'the note is trimmed');

-- Hidden types and the half-day switch
reset role;
update absence_types set visible = false where code = 'training';
update app_settings set half_days = false;
set local role authenticated;
select throws_ok($$select set_absence('00000000-0000-0000-0000-0000000000b3', '2026-11-11', 'training')$$,
  'P0001', '„Fortbildung“ ist ausgeblendet und kann nicht neu eingetragen werden.', 'hidden types are refused');
select throws_ok($$select set_absence('00000000-0000-0000-0000-0000000000b3', '2026-11-11', 'vacation', 'pm')$$,
  'P0001', 'Halbe Tage sind in den Einstellungen ausgeschaltet.', 'half days are refused when switched off');

-- As an employee
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
select throws_ok($$select set_absence('00000000-0000-0000-0000-0000000000b3', '2026-11-11', 'sick')$$,
  '42501', 'Das darf nur die Praxisleitung.', 'employees cannot use the admin grid');
select is((select count(*)::int from absence_days), 0, 'employees do not see other people''s entries');
select is((select count(*)::int from audit_log) + (select count(*)::int from day_notes), 0,
  'employees cannot read the audit log or notes');

select * from finish();
rollback;
