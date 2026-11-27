-- T1 Core schema (R1, R3, R19, R24, R25)
begin;
select plan(21);
-- The switches can be changed in the app; the tests assume all on (rolled back at the end).
update public.app_settings set team_calendar = true, half_days = true, substitutes = true, au_tracking = true;

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

-- Reference data
select is((select count(*)::int from teams), 3, 'three teams are seeded');
select is((select count(*)::int from absence_types), 15, 'fifteen absence types are seeded');
select is((select count(*)::int from absence_types where is_fixed), 3, 'Urlaub, Betriebsurlaub, Krank are fixed');
-- The live row can be switched in the app (R24); a fresh install starts with every switch on.
select ok((select bool_and(column_default = 'true') from information_schema.columns
            where table_schema = 'public' and table_name = 'app_settings'
              and column_name in ('team_calendar', 'half_days', 'substitutes', 'au_tracking')),
          'all feature switches start on');
select ok((select column_default = 'false' from information_schema.columns
            where table_schema = 'public' and table_name = 'app_settings' and column_name = 'reminders'),
          'vacation reminders start off');

-- Account trigger
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'leitung@example.org',
   '{"username":"leitung","full_name":"Praxis Leitung","team":"verwaltung"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'samira@users.mvz-elsharafi.invalid',
   '{"username":"Samira","full_name":"Samira Haddad","team":"arbeiter","workdays":[1,2,4,5],"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'lena@example.org',
   '{"username":"lena","full_name":"Lena Hoffmann","team":"arbeiter"}', '{}');

select is((select role from profiles where username = 'leitung'), 'admin', 'role comes from app_metadata');
select is((select role from profiles where username = 'samira'), 'employee',
          'a role in user_metadata is ignored');
select is((select workdays from profiles where username = 'samira'), '{1,2,4,5}'::smallint[],
          'workdays are taken from metadata');
select is((select notify_email from profiles where username = 'samira'), null,
          'internal login addresses are not used for notifications');
select is((select notify_email from profiles where username = 'lena'), 'lena@example.org',
          'a real address becomes the notification email');
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-00000000000d', 'x@example.org', '{"username":"ohneteam","full_name":"X"}')$$,
  '23502', null, 'an account without a team is refused');

-- Fixed types (R25)
select throws_ok($$update absence_types set visible = false where code = 'sick'$$,
  'P0001', 'Bei „Krank“ können nur Bezeichnung und Farbe geändert werden.', 'a fixed type cannot be hidden');
select lives_ok($$update absence_types set label = 'Krankmeldung' where code = 'sick'$$,
  'a fixed type can be renamed');
select throws_ok($$update absence_types set code = 'ill' where code = 'child_sick'$$,
  'P0001', 'Das Kürzel einer Abwesenheitsart kann nicht geändert werden.', 'codes never change');
select throws_ok($$delete from absence_types where code = 'vacation'$$,
  'P0001', 'Die Art „Urlaub“ ist fest und kann nicht gelöscht werden.', 'a fixed type cannot be deleted');

-- RLS as an employee
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from profiles), 1, 'an employee sees only their own profile');
select is((select count(*)::int from teams), 3, 'an employee can read the teams');
update profiles set full_name = 'Gehackt' where username = 'samira';
select is((select full_name from profiles where username = 'samira'), 'Samira Haddad',
          'an employee cannot edit their profile');
select ok(not is_admin(), 'is_admin() is false for an employee');

-- RLS as the admin
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from profiles), 3, 'the admin sees every profile');
select throws_ok($$update profiles set active = false where username = 'leitung'$$,
  'P0001', 'Sie können sich nicht selbst deaktivieren oder Ihre Admin-Rolle entfernen.',
  'the admin cannot deactivate themselves');

select * from finish();
rollback;
