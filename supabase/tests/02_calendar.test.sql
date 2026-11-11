-- T2 Calendar (R5, R6)
begin;
select plan(9);
-- The switches can be changed in the app; the tests assume all on (rolled back at the end).
update public.app_settings set team_calendar = true, half_days = true, substitutes = true, au_tracking = true;

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

select results_eq(
  $$select day from berlin_holidays(2026)$$,
  $$values ('2026-01-01'::date), ('2026-03-08'), ('2026-04-03'), ('2026-04-06'), ('2026-05-01'),
           ('2026-05-14'), ('2026-05-25'), ('2026-10-03'), ('2026-12-25'), ('2026-12-26')$$,
  'Berlin holidays 2026 are correct');
select ok(exists (select 1 from berlin_holidays(2025) where day = '2025-05-08'),
  '8.5.2025 is a one-off holiday');
select ok(not exists (select 1 from berlin_holidays(2026) where day = '2026-05-08'),
  '8.5. is not a holiday in other years');
select ok(not exists (select 1 from berlin_holidays(2018) where day = '2018-03-08'),
  'Frauentag only counts from 2019');
select is((select day from berlin_holidays(2027) where name = 'Karfreitag'), '2027-03-26'::date,
  'Easter is computed for later years');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'voll@example.org',
   '{"username":"voll","full_name":"Voll Zeit","team":"arbeiter","start_date":"2020-01-01"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'teil@example.org',
   '{"username":"teil","full_name":"Teil Zeit","team":"arbeiter","workdays":[1,2,4],"start_date":"2020-01-01"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'neu@example.org',
   '{"username":"neu","full_name":"Neu Start","team":"arbeiter","start_date":"2026-04-08"}');

select is((select count(*)::int from person_workdays('00000000-0000-0000-0000-0000000000a1', '2026-04-01', '2026-04-10')),
  6, 'full-time: 1.–10.4.2026 has 6 working days (Karfreitag and Ostermontag excluded)');
select results_eq(
  $$select * from person_workdays('00000000-0000-0000-0000-0000000000a2', '2026-04-06', '2026-04-10')$$,
  $$values ('2026-04-07'::date), ('2026-04-09')$$,
  'Mon/Tue/Thu part-timer: 6.–10.4.2026 counts 2 days');
select is((select count(*)::int from person_workdays('00000000-0000-0000-0000-0000000000a3', '2026-04-01', '2026-04-10')),
  3, 'days before the start date do not count');
select is((select count(*)::int from person_workdays('00000000-0000-0000-0000-0000000000a1', '2026-04-04', '2026-04-05')),
  0, 'weekends never count');

select * from finish();
rollback;
