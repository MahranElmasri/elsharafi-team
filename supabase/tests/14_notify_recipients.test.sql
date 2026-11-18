-- T17g Reception emails (R18, v1.15)
begin;
select plan(13);
update public.app_settings set team_calendar = true, half_days = true, substitutes = true, au_tracking = true;

-- Start from an empty practice; everything is rolled back at the end.
delete from absence_days; delete from leave_requests; delete from notify_recipients; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'leitung@example.org',
   '{"username":"leitung","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'anna@example.org',
   '{"username":"anna","full_name":"Dr. Anna","team":"aerzte","start_date":"2020-01-01"}', '{}');
insert into leave_allowances values ('00000000-0000-0000-0000-0000000000f2', 2026, 30, 0);
create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;
-- The reception's emails in one result.
create function pg_temp.to_reception(res jsonb) returns setof jsonb language sql as $$
  select e from jsonb_array_elements(res -> 'emails') e where e ->> 'to' = 'empfang@example.org';
$$;

set local role authenticated;

-- Employees can neither read nor add addresses.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
select throws_ok($$insert into notify_recipients (email) values ('x@example.org')$$, '42501', null,
  'an employee cannot add an address');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
insert into notify_recipients (email) values ('empfang@example.org');
select throws_ok($$insert into notify_recipients (email) values ('kein-at-zeichen')$$, '23514', null,
  'an invalid address is refused');
select is((select count(*)::int from audit_log where table_name = 'notify_recipients'), 1, 'adding is audit-logged');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
select is((select count(*)::int from notify_recipients), 0, 'an employee sees no addresses');

-- A sick report: the reception is told at once, name and dates only.
insert into r values ('sick', report_absence('sick', '2026-11-23', '2026-11-25', 'Fieber'));
select results_eq($$select e ->> 'subject', e ->> 'text', e ->> 'link' from r, pg_temp.to_reception(v) e where k = 'sick'$$,
  $$values ('Nicht in der Praxis: Dr. Anna, 23.11.–25.11.2026',
            'Dr. Anna ist vom 23.11. bis 25.11.2026 nicht in der Praxis.', null::text)$$,
  'a sick report tells the reception who and when, with no link');
select ok((select bool_and(e::text !~* 'krank|fieber') from r, pg_temp.to_reception(v) e where k = 'sick'),
  'no reason or note reaches the reception');

-- A vacation request: nothing to the reception yet; withdrawing it: nothing either.
insert into r values ('req', request_leave('vacation', '2026-12-07', '2026-12-07'));
select is((select count(*)::int from r, pg_temp.to_reception(v) e where k = 'req'), 0,
  'a request alone does not reach the reception');
insert into r values ('req2', request_leave('vacation', '2026-12-14', '2026-12-18'));
insert into r values ('withdraw', cancel_leave((select (v ->> 'request_id')::uuid from r where k = 'req2')));
select is((select count(*)::int from r, pg_temp.to_reception(v) e where k = 'withdraw'), 0,
  'withdrawing a pending request does not reach the reception');

-- The admin approves: now the reception is told.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
insert into r values ('approve', decide_leave((select (v ->> 'request_id')::uuid from r where k = 'req'), true));
select results_eq($$select e ->> 'text' from r, pg_temp.to_reception(v) e where k = 'approve'$$,
  $$values ('Dr. Anna ist am 7.12.2026 nicht in der Praxis.')$$, 'an approval tells the reception');

-- A denial does not.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
insert into r values ('req3', request_leave('vacation', '2026-12-21', '2026-12-21'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
insert into r values ('deny', decide_leave((select (v ->> 'request_id')::uuid from r where k = 'req3'), false));
select is((select count(*)::int from r, pg_temp.to_reception(v) e where k = 'deny'), 0, 'a denial does not');

-- Cancelling the approved leave: the reception learns the person is in after all.
insert into r values ('cancel', cancel_leave((select (v ->> 'request_id')::uuid from r where k = 'req')));
select results_eq($$select e ->> 'subject' from r, pg_temp.to_reception(v) e where k = 'cancel'$$,
  $$values ('Doch in der Praxis: Dr. Anna, 7.12.2026')$$, 'cancelling an approved leave tells the reception');

-- Email only: the reception has no account, so no extra in-app notices.
reset role;
select is((select count(*)::int from notifications where user_id not in
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2')), 0,
  'no in-app notice for the reception');

-- Removing the address stops it.
set local role authenticated;
delete from notify_recipients where email = 'empfang@example.org';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
insert into r values ('sick2', report_absence('sick', '2026-11-27', '2026-11-27'));
select is((select count(*)::int from r, pg_temp.to_reception(v) e where k = 'sick2'), 0, 'a removed address gets nothing');

select * from finish();
rollback;
