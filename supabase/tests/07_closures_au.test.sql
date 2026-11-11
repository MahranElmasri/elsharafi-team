-- T7 Closures and AU (R16, R17)
begin;
select plan(14);
-- The switches can be changed in the app; the tests assume all on (rolled back at the end).
update public.app_settings set team_calendar = true, half_days = true, substitutes = true, au_tracking = true;

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'leitung@example.org',
   '{"username":"leitung","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'voll@example.org',
   '{"username":"voll","full_name":"Voll Zeit","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000f3', 'teil@example.org',
   '{"username":"teil","full_name":"Teil Zeit","team":"arbeiter","workdays":[1,2,4],"start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000f4', 'krank@example.org',
   '{"username":"krank","full_name":"Kranke Person","team":"arbeiter","start_date":"2020-01-01"}', '{}');
insert into absence_days (user_id, day, type) values
  ('00000000-0000-0000-0000-0000000000f4', '2026-12-29', 'sick'),
  -- a Thu–Mon sick run (5 calendar days) and a separate 2-day run
  ('00000000-0000-0000-0000-0000000000f2', '2026-11-05', 'sick'),
  ('00000000-0000-0000-0000-0000000000f2', '2026-11-06', 'sick'),
  ('00000000-0000-0000-0000-0000000000f2', '2026-11-09', 'sick'),
  ('00000000-0000-0000-0000-0000000000f2', '2026-11-17', 'sick'),
  ('00000000-0000-0000-0000-0000000000f2', '2026-11-18', 'sick');

create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

-- Closure 24.–31.12.2026 (25./26. are holidays/weekend)
insert into r values ('c1', set_closure('2026-12-24', '2026-12-31', 'Praxis geschlossen'));
select is((select (v ->> 'closure_days')::int from r where k = 'c1'), 5, '24., 28.–31.12. are closure days');
select is((select count(*)::int from absence_days where user_id = '00000000-0000-0000-0000-0000000000f2' and type = 'closure'),
  5, 'full-time staff get 5 B days');
select is((select count(*)::int from absence_days where user_id = '00000000-0000-0000-0000-0000000000f3' and type = 'closure'),
  4, 'the Mon/Tue/Thu part-timer gets 4 B days');
select is((select v -> 'conflicts' -> 0 ->> 'day' from r where k = 'c1'), '2026-12-29',
  'an existing sick day is skipped and listed');
insert into r values ('c2', set_closure('2026-12-24', '2026-12-31', 'Praxis geschlossen'));
select is((select (v ->> 'added')::int from r where k = 'c2'), 0, 'running it again adds nothing');
select is((select (remove_closure('2026-12-24', '2026-12-31') ->> 'removed')::int), 18,
  'removing deletes the B days of all four people (5 + 4 + 4 + admin 5)');
select is((select count(*)::int from absence_days where day = '2026-12-29'), 1, 'the sick day stays');

-- AU
select results_eq($$select start_date, end_date, missing from missing_au()$$,
  $$values ('2026-11-05'::date, '2026-11-09'::date, 3)$$,
  'only the run over 3 calendar days without AU is listed');
select is(set_au('00000000-0000-0000-0000-0000000000f2', '2026-11-09', true), 3,
  '"AU liegt vor" covers the whole run');
select is((select count(*)::int from missing_au()), 0, 'nothing is missing any more');
select is((select count(*)::int from absence_days where day in ('2026-11-17', '2026-11-18') and au_received), 0,
  'other runs are untouched');
select throws_ok($$select set_au('00000000-0000-0000-0000-0000000000f2', '2026-11-10', true)$$,
  'P0001', 'An diesem Tag ist keine Krankheit eingetragen.', 'AU needs a sick day');

reset role;
update app_settings set au_tracking = false;
set local role authenticated;
select throws_ok($$select set_au('00000000-0000-0000-0000-0000000000f2', '2026-11-09', false)$$,
  'P0001', 'Die AU-Kontrolle ist in den Einstellungen ausgeschaltet.', 'switched off: set_au is refused');
select ok((select au_received from absence_days where day = '2026-11-09'), 'switched off: stored AU flags are kept');

select * from finish();
rollback;
