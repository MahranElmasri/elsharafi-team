-- T4 Balances (R12, R13, R14)
begin;
select plan(14);
-- The switches can be changed in the app; the tests assume all on (rolled back at the end).
update public.app_settings set team_calendar = true, half_days = true, substitutes = true, au_tracking = true;

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin@example.org',
   '{"username":"admin","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'voll@example.org',
   '{"username":"voll","full_name":"Voll Zeit","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', 'neu@example.org',
   '{"username":"neu","full_name":"Neu Start","team":"arbeiter","workdays":[1,2,4],"start_date":"2026-07-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000c4', 'geht@example.org',
   '{"username":"geht","full_name":"Geht Bald","team":"arbeiter","start_date":"2020-01-01"}', '{}');
update profiles set end_date = '2026-03-31' where username = 'geht';

insert into leave_allowances values ('00000000-0000-0000-0000-0000000000c2', 2026, 30, 5);
-- 3 approved vacation days in March, a pending half day in May, 2 sick days
insert into absence_days (user_id, day, type, status) values
  ('00000000-0000-0000-0000-0000000000c2', '2026-03-02', 'vacation', 'approved'),
  ('00000000-0000-0000-0000-0000000000c2', '2026-03-03', 'vacation', 'approved'),
  ('00000000-0000-0000-0000-0000000000c2', '2026-03-04', 'vacation', 'approved'),
  ('00000000-0000-0000-0000-0000000000c2', '2026-11-02', 'sick', 'approved'),
  ('00000000-0000-0000-0000-0000000000c2', '2026-11-03', 'sick', 'approved');
insert into absence_days (user_id, day, type, status, amount, half) values
  ('00000000-0000-0000-0000-0000000000c2', '2026-05-04', 'vacation', 'pending', 0.5, 'pm');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

-- Pro-rata (§5 BUrlG)
select is(suggested_allowance('00000000-0000-0000-0000-0000000000c2', 2026, 30), 30::numeric,
  'full year, full time: 30');
select is(suggested_allowance('00000000-0000-0000-0000-0000000000c3', 2026, 30), 9::numeric,
  'joiner on 1.7. with 3 workdays: 30 × 3/5 × 6/12 = 9');
select is(suggested_allowance('00000000-0000-0000-0000-0000000000c4', 2026, 30), 8::numeric,
  'leaver on 31.3.: 7.5 rounds up to 8');

-- Carry-over before and after 31.3.
select is((select carryover_expired from balance_of('00000000-0000-0000-0000-0000000000c2', 2026, '2026-03-15')),
  0::numeric, 'nothing expires before 31.3.');
select is((select remaining from balance_of('00000000-0000-0000-0000-0000000000c2', 2026, '2026-03-15')),
  32::numeric, 'mid-March: 30 + 5 − 3 = 32 remaining');
select is((select carryover_used from balance_of('00000000-0000-0000-0000-0000000000c2', 2026, '2026-04-01')),
  3::numeric, 'March vacation uses carry-over first');
select is((select carryover_expired from balance_of('00000000-0000-0000-0000-0000000000c2', 2026, '2026-04-01')),
  2::numeric, 'on 1.4. the unused 2 days of carry-over expire');
select is((select remaining from balance_of('00000000-0000-0000-0000-0000000000c2', 2026, '2026-04-01')),
  30::numeric, 'after expiry: 30 + 5 − 2 − 3 = 30 remaining');
select is((select available from balance_of('00000000-0000-0000-0000-0000000000c2', 2026, '2026-04-01')),
  29.5::numeric, 'the pending half day lowers what can still be requested');
select is((select sick_days from balance_of('00000000-0000-0000-0000-0000000000c2', 2026, '2026-04-01')),
  2::numeric, 'sick days are counted');
select is((select vacation_taken from balance_of('00000000-0000-0000-0000-0000000000c2', 2026, '2026-04-01')),
  3::numeric, 'sick days do not reduce vacation');
select is((select count(*)::int from balances(2026)), 4, 'the admin sees every balance');

-- As an employee
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select is((select count(*)::int from balances(2026)), 1, 'an employee sees only their own balance');
select throws_ok($$select * from balance_of('00000000-0000-0000-0000-0000000000c3', 2026)$$,
  '42501', 'Das darf nur die Praxisleitung.', 'an employee cannot read another balance');

select * from finish();
rollback;
