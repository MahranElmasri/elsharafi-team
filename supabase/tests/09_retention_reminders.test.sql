-- T8 Reminders, retention, scheduled jobs (R15, R20)
begin;
select plan(17);

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000201', 'leitung@example.org',
   '{"username":"leitung","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000202', 'anna@example.org',
   '{"username":"anna","full_name":"Anna","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-000000000203', 'bert@users.mvz-elsharafi.invalid',
   '{"username":"bert","full_name":"Bert","team":"arbeiter","start_date":"2020-01-01"}', '{}');
insert into leave_allowances values
  ('00000000-0000-0000-0000-000000000202', 2026, 30, 4),
  ('00000000-0000-0000-0000-000000000203', 2026, 2, 0);
insert into absence_days (user_id, day, type) values
  ('00000000-0000-0000-0000-000000000203', '2026-06-01', 'vacation'),
  ('00000000-0000-0000-0000-000000000203', '2026-06-02', 'vacation'),
  -- retention
  ('00000000-0000-0000-0000-000000000202', '2022-03-01', 'sick'),
  ('00000000-0000-0000-0000-000000000202', '2022-03-02', 'child_sick'),
  ('00000000-0000-0000-0000-000000000202', '2022-03-03', 'vacation'),
  ('00000000-0000-0000-0000-000000000202', '2023-01-02', 'sick');
insert into day_notes (user_id, day, note) values ('00000000-0000-0000-0000-000000000202', '2022-03-01', 'Grippe');

-- Reminders (as the endpoint: service role)
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*)::int from due_reminders('2026-09-30')), 0, 'no reminder before 1.10.');
select results_eq($$select full_name, kind, days_at_risk from due_reminders('2026-10-01')$$,
  $$values ('Anna', 'year_end', 30::numeric)$$, 'from 1.10.: only people with days left (carry-over expired, Bert used his)');
select results_eq($$select kind, days_at_risk from due_reminders('2026-02-02')$$,
  $$values ('carryover', 4::numeric)$$, 'February: carry-over is due, year-end is not');
select is((select count(*)::int from due_reminders('2026-04-01') where kind = 'carryover'), 0, 'no carry-over reminder after 31.3.');
select is((select jsonb_array_length(run_reminders('2026-10-01'))), 1, 'run_reminders returns one email');
select is((select count(*)::int from reminder_log where channel = 'in_app'), 1, 'the in-app reminder is logged');
reset role;
update reminder_log set sent_at = '2026-10-01 08:00+02';
set local role service_role;
select is((select count(*)::int from due_reminders('2026-10-20')), 0, 'nothing is due twice in the same month');
select is((select count(*)::int from due_reminders('2026-11-02')), 1, 'the next month it is due again');
select lives_ok($$select log_reminder_email('00000000-0000-0000-0000-000000000202', 'year_end', 2026, 34)$$,
  'the endpoint logs the sent email');

-- Employees see their own reminder log, never run reminders
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated"}', true);
select is((select count(*)::int from reminder_log), 2, 'an employee sees their own reminder log');
select throws_ok($$select run_reminders()$$, '42501', null, 'employees cannot run reminders');

-- Retention (as the cron job: postgres)
reset role;
select is(purge_health_data('2026-11-10'), 2, 'X and K days from 2022 are deleted');
select is((select count(*)::int from absence_days where day = '2022-03-03'), 1, 'vacation from 2022 is kept');
select is((select count(*)::int from absence_days where day = '2023-01-02'), 1, 'sick days from 2023 are kept');
select is((select count(*)::int from day_notes where day = '2022-03-01'), 0, 'notes on deleted days go too');
select is((select count(*)::int from audit_log where row_key like '%|2022-03-0_' and (coalesce(old, new) ->> 'type') in ('sick', 'child_sick')),
  0, 'audit rows holding the deleted days are gone');

select is((select count(*)::int from cron.job where jobname in ('purge-health-data', 'daily-reminders')), 2,
  'both cron jobs are scheduled');

select * from finish();
rollback;
