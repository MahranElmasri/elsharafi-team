-- T5 Requests, sick report, approval, notifications (R7, R8, R9, R18)
begin;
select plan(33);
-- The switches can be changed in the app; the tests assume all on (rolled back at the end).
update public.app_settings set team_calendar = true, half_days = true, substitutes = true, au_tracking = true;

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'leitung@example.org',
   '{"username":"leitung","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'anna@example.org',
   '{"username":"anna","full_name":"Anna Arbeiter","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000d3', 'bert@users.mvz-elsharafi.invalid',
   '{"username":"bert","full_name":"Bert Kollege","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-0000000000d4', 'dora@example.org',
   '{"username":"dora","full_name":"Dr. Dora","team":"aerzte","start_date":"2020-01-01"}', '{}');
insert into leave_allowances values ('00000000-0000-0000-0000-0000000000d2', 2026, 10, 0);

create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);

-- Request with a substitute
insert into r values ('first', request_leave('vacation', '2026-11-16', '2026-11-20', null, null,
  '00000000-0000-0000-0000-0000000000d3', 'Familienbesuch'));
select is((select (v ->> 'days')::numeric from r where k = 'first'), 5::numeric, 'Mon–Fri counts 5 working days');
select is((select count(*)::int from absence_days where status = 'pending'), 5, 'five pending days are written');
select is((select jsonb_array_length(v -> 'emails') from r where k = 'first'), 1,
  'one email: the admin has an address, the substitute does not');
select is((select v -> 'emails' -> 0 ->> 'to' from r where k = 'first'), 'leitung@example.org', 'the email goes to the admin');

select throws_ok($$select request_leave('vacation', '2026-11-20', '2026-11-23')$$,
  'P0001', 'Am 20.11.2026 gibt es schon einen Eintrag. Wählen Sie andere Tage.', 'an overlap is refused and names the day');
select throws_ok($$select request_leave('vacation', '2026-11-23', '2026-11-30')$$,
  'P0001', 'Dafür reichen Ihre Urlaubstage nicht: 5 verfügbar, 6 beantragt.', 'too many days are refused');
select throws_ok($$select request_leave('vacation', '2026-11-21', '2026-11-22')$$,
  'P0001', 'An diesen Tagen arbeiten Sie nicht. Wählen Sie andere Tage.', 'a weekend-only request is refused');
select throws_ok($$select request_leave('vacation', '2026-12-30', '2027-01-04')$$,
  'P0001', 'Bitte teilen Sie den Antrag am Jahreswechsel in zwei Anträge.', 'requests cannot cross the year');
select throws_ok($$select request_leave('sick', '2026-12-01', '2026-12-01')$$,
  'P0001', 'Diese Abwesenheitsart kann nicht beantragt werden.', 'sick days are reported, not requested');
select throws_ok($$select request_leave('vacation', '2026-12-01', '2026-12-01', null, null, '00000000-0000-0000-0000-0000000000d4')$$,
  'P0001', 'Die Vertretung muss aus Ihrer Gruppe sein.', 'the substitute must be in the same team');

insert into r values ('half', request_leave('vacation', '2026-12-01', '2026-12-01', 'pm'));
insert into r values ('deny', request_leave('vacation', '2026-12-07', '2026-12-07', null, null,
  '00000000-0000-0000-0000-0000000000d3'));
select is((select (v ->> 'days')::numeric from r where k = 'half'), 0.5::numeric, 'a half day counts 0.5');
select throws_ok(format('select decide_leave(%L, true)', (select v ->> 'request_id' from r where k = 'first')),
  '42501', 'Das darf nur die Praxisleitung.', 'an employee cannot decide');

-- The substitute: not told yet (only on approval), and cannot read the request
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
select is((select count(*)::int from notifications), 0, 'the substitute is not notified when the request is made');
select is((select count(*)::int from leave_requests), 0, 'the substitute cannot read the request');

-- Admin decides
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into r values ('ok', decide_leave((select (v ->> 'request_id')::uuid from r where k = 'first'), true, 'Gute Erholung'));
select is((select count(*)::int from absence_days where request_id = (select (v ->> 'request_id')::uuid from r where k = 'first')
           and status = 'approved'), 5, 'approval turns the days to approved');
select is((select v -> 'emails' -> 0 ->> 'subject' from r where k = 'ok'),
  'Ihr Antrag Urlaub 16.11.–20.11.2026 wurde genehmigt.', 'the employee gets the decision');
select throws_ok(format('select decide_leave(%L, false)', (select v ->> 'request_id' from r where k = 'first')),
  'P0001', 'Über diesen Antrag wurde schon entschieden.', 'a request is decided only once');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
select is((select message from notifications), 'Sie vertreten Anna Arbeiter: 16.11.–20.11.2026',
  'on approval the substitute is notified with name and dates only');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

reset role;
update leave_allowances set days = 5 where user_id = '00000000-0000-0000-0000-0000000000d2';
set local role authenticated;
select throws_ok(format('select decide_leave(%L, true)', (select v ->> 'request_id' from r where k = 'half')),
  'P0001', 'Nicht genug Urlaub: 0 übrig, der Antrag braucht 0,5.', 'approval re-checks the balance');

-- A denied request with a substitute: the substitute hears nothing
insert into r values ('denied', decide_leave((select (v ->> 'request_id')::uuid from r where k = 'deny'), false));
select is((select jsonb_array_length(v -> 'emails') from r where k = 'denied'), 1, 'a denial emails only the employee');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
select is((select count(*)::int from notifications), 1, 'a denial does not notify the substitute');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

-- Admin cancels the approved request: the substitute is told it is off
insert into r values ('storno', cancel_leave((select (v ->> 'request_id')::uuid from r where k = 'first')));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
select is((select count(*)::int from notifications where message = 'Vertretung entfällt: Anna Arbeiter, 16.11.–20.11.2026'), 1,
  'cancelling an approved request tells the substitute');

-- Employee withdraws, then reports sick
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select lives_ok(format('select cancel_leave(%L)', (select v ->> 'request_id' from r where k = 'half')), 'the owner withdraws a pending request');
select is((select count(*)::int from absence_days where day = '2026-12-01'), 0, 'its days are removed');
select throws_ok(format('select cancel_leave(%L)', (select v ->> 'request_id' from r where k = 'first')),
  '42501', 'Dieser Antrag kann nicht mehr zurückgezogen werden.', 'an approved request cannot be withdrawn by the owner');

insert into r values ('sick', report_absence('sick', '2026-11-20', '2026-11-24'));
select is((select (v ->> 'days')::int from r where k = 'sick'), 3, 'sick days are added on free working days');
select is((select jsonb_array_length(v -> 'skipped') from r where k = 'sick'), 0, 'the cancelled vacation left the days free');

select throws_ok($$select report_absence('sick', '2026-12-02', '2026-12-02', null, '00000000-0000-0000-0000-0000000000d4')$$,
  'P0001', 'Die Vertretung muss aus Ihrer Gruppe sein.', 'a sick-report substitute must be in the same team');
insert into r values ('sick2', report_absence('sick', '2026-12-02', '2026-12-03', null, '00000000-0000-0000-0000-0000000000d3'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
select is((select count(*)::int from notifications where message = 'Sie vertreten Anna Arbeiter: 2.12.–3.12.2026'), 1,
  'a sick-report substitute is told at once');
select is((select count(*)::int from notifications where message ilike '%krank%'), 0, 'the substitute never sees the type');

reset role;
update public.app_settings set substitutes = false;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select lives_ok($$select report_absence('sick', '2026-12-04', '2026-12-04', null, '00000000-0000-0000-0000-0000000000d3')$$,
  'with the switch off a substitute is ignored');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
select is((select count(*)::int from notifications where message like 'Sie vertreten%'), 2, 'switch off: nobody is notified');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select is((select count(*)::int from notifications where message = 'Anna Arbeiter: Krank, 20.11.–24.11.2026'), 1,
  'the admin is notified of the sick report');

select * from finish();
rollback;
