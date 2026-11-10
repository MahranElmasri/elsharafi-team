-- T10 Employee management (R19, R13)
begin;
select plan(17);

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000501', 'leitung@example.org',
   '{"username":"leitung","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000502', 'anna@example.org',
   '{"username":"anna","full_name":"Anna","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-000000000503', 'leer@users.mvz-elsharafi.invalid',
   '{"username":"leer","full_name":"Ohne Einträge","team":"arbeiter","start_date":"2020-01-01"}', '{}');
insert into absence_days (user_id, day, type) values ('00000000-0000-0000-0000-000000000502', '2026-11-10', 'sick');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);

-- Conflicts
select is(employee_conflict(null, 'Anna', null), 'Den Benutzernamen „anna“ gibt es schon. Wählen Sie einen anderen.',
  'a taken username is reported, case-insensitively');
select is(employee_conflict(null, 'neu', 'ANNA@example.org'),
  'Die E-Mail-Adresse anna@example.org gehört schon zu einem anderen Konto.', 'a taken email is reported');
select is(employee_conflict('00000000-0000-0000-0000-000000000502', 'anna', 'anna@example.org'), null,
  'a person keeps their own username and email');
select ok(employee_conflict(null, 'a b', null) like 'Der Benutzername braucht%', 'a malformed username is reported');

-- Edit
select lives_ok($$select save_employee('00000000-0000-0000-0000-000000000502', 'anna.b', 'Anna B.', '', 'aerzte',
  'employee', '{4,2,2,1}', '2020-01-01', null)$$, 'the admin edits a person');
select results_eq($$select username, full_name, notify_email, team_id, workdays from profiles where id = '00000000-0000-0000-0000-000000000502'$$,
  $$values ('anna.b', 'Anna B.', null::text, 'aerzte', '{1,2,4}'::smallint[])$$,
  'values are cleaned: empty email removed, workdays sorted and unique');
select throws_ok($$select save_employee('00000000-0000-0000-0000-000000000502', 'anna.b', 'Anna B.', null, 'aerzte',
  'employee', '{}', '2020-01-01', null)$$, 'P0001', 'Wählen Sie mindestens einen Arbeitstag.', 'workdays are required');
select throws_ok($$select save_employee('00000000-0000-0000-0000-000000000501', 'leitung', 'Praxis Leitung', null,
  'verwaltung', 'employee', '{1,2,3,4,5}', '2020-01-01', null)$$,
  'P0001', 'Sie können sich nicht selbst deaktivieren oder Ihre Admin-Rolle entfernen.', 'the admin cannot demote themselves');

-- Deactivate
select throws_ok($$select set_employee_active('00000000-0000-0000-0000-000000000501', false)$$,
  'P0001', 'Sie können sich nicht selbst deaktivieren.', 'the admin cannot deactivate themselves');
reset role;
insert into invite_tokens (user_id, token_hash, purpose) values ('00000000-0000-0000-0000-000000000503', repeat('a', 64), 'invite');
set local role authenticated;
select lives_ok($$select set_employee_active('00000000-0000-0000-0000-000000000503', false)$$, 'the admin deactivates someone');
reset role;
select ok((select used_at is not null from invite_tokens where token_hash = repeat('a', 64)), 'their open link stops working');
set local role authenticated;

-- Delete
select throws_ok($$select delete_employee('00000000-0000-0000-0000-000000000502')$$, 'P0001',
  'Anna B. hat schon Einträge und kann nicht gelöscht werden. Deaktivieren Sie das Konto stattdessen.',
  'someone with entries cannot be deleted');
select lives_ok($$select delete_employee('00000000-0000-0000-0000-000000000503')$$, 'someone without entries can be deleted');
select is((select count(*)::int from profiles where username = 'leer'), 0, 'the profile is gone');

-- Allowance and team limit
select lives_ok($$select set_allowance('00000000-0000-0000-0000-000000000502', 2026, 27.5, 3)$$, 'the admin sets an allowance');
select throws_ok($$select set_team_limit('arbeiter', -1)$$, 'P0001', 'Die Grenze muss zwischen 0 und 50 liegen.',
  'team limits are checked');

-- Employees cannot do any of it
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select throws_ok($$select set_allowance('00000000-0000-0000-0000-000000000502', 2026, 99, 0)$$, '42501',
  'Das darf nur die Praxisleitung.', 'employees cannot change their own allowance');

select * from finish();
rollback;
