-- T6 Conflicts, staffing load, team calendar (R10, R11)
begin;
select plan(11);
-- The switches can be changed in the app; the tests assume all on (rolled back at the end).
update public.app_settings set team_calendar = true, half_days = true, substitutes = true, au_tracking = true;

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'leitung@example.org',
   '{"username":"leitung","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'anna@example.org',
   '{"username":"anna","full_name":"Anna","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000e3', 'lena@example.org',
   '{"username":"lena","full_name":"Lena","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000e4', 'kai@example.org',
   '{"username":"kai","full_name":"Kai","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000e5', 'dora@example.org',
   '{"username":"dora","full_name":"Dr. Dora","team":"aerzte","start_date":"2020-01-01"}', '{}');
insert into leave_allowances values ('00000000-0000-0000-0000-0000000000e2', 2026, 30, 0);
insert into absence_days (user_id, day, type) values
  ('00000000-0000-0000-0000-0000000000e3', '2026-11-24', 'vacation'),
  ('00000000-0000-0000-0000-0000000000e3', '2026-11-25', 'vacation'),
  ('00000000-0000-0000-0000-0000000000e4', '2026-11-25', 'sick'),
  ('00000000-0000-0000-0000-0000000000e5', '2026-11-25', 'sick');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
select request_leave('vacation', '2026-11-23', '2026-11-27');

-- Team calendar as Lena
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
select is((select string_agg(k, ',' order by k) from (
  select distinct jsonb_object_keys(to_jsonb(t)) k from team_calendar('2026-11-01', '2026-11-30') t) x),
  'day,full_name,status,user_id', 'the team calendar never returns the absence type');
select is((select count(*)::int from team_calendar('2026-11-01', '2026-11-30') where full_name = 'Kai'), 1,
  'Kai''s sick day shows, as absent only');
select is((select count(*)::int from team_calendar('2026-11-01', '2026-11-30') where full_name = 'Anna' and status = 'pending'), 5,
  'Anna''s pending request shows as pending');
select is((select count(*)::int from team_calendar('2026-11-01', '2026-11-30') where full_name = 'Dr. Dora'), 0,
  'other teams are not shown');
select is((select count(*)::int from team_members()), 2, 'team members are the other people in Lena''s team');
select throws_ok($$select * from request_conflicts()$$, '42501', 'Das darf nur die Praxisleitung.',
  'employees cannot read conflicts');

reset role;
update app_settings set team_calendar = false;
set local role authenticated;
select is((select count(*)::int from team_calendar('2026-11-01', '2026-11-30')), 0,
  'with the switch off, employees see nothing');

-- Admin view
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select results_eq($$select full_name, type, status, days from request_conflicts() order by full_name$$,
  $$values ('Kai', 'sick', 'approved', array['2026-11-25'::date]),
           ('Lena', 'vacation', 'approved', array['2026-11-24'::date, '2026-11-25'])$$,
  'conflicts list same-team colleagues with their days, not other teams');
select results_eq($$select day, absent_count, max_absent from request_over_limit()$$,
  $$values ('2026-11-25'::date, 3, 2)$$, 'only 25.11. goes over the Arbeiter limit of 2');
select is((select absent_count from team_day_load('2026-11-25', '2026-11-25') where team_id = 'aerzte'), 1,
  'the daily load counts per team');
select is((select count(*)::int from team_day_load('2026-11-28', '2026-11-29')), 0, 'weekends are not counted');

select * from finish();
rollback;
