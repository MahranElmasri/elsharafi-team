-- T7b Types, limits, range entry, switches (R24, R25, R26)
begin;
select plan(15);

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'leitung@example.org',
   '{"username":"leitung","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000102', 'hanna@example.org',
   '{"username":"hanna","full_name":"Dr. Hanna","team":"aerzte","workdays":[2,3,4],"start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-000000000103', 'tobi@example.org',
   '{"username":"tobi","full_name":"Tobi","team":"verwaltung","workdays":[1,2,4,5],"start_date":"2020-01-01"}', '{}');
-- 8 days of Bildungsurlaub in 2025
insert into absence_days (user_id, day, type)
select '00000000-0000-0000-0000-000000000102', d, 'education'
  from person_workdays('00000000-0000-0000-0000-000000000102', '2025-06-03', '2025-06-19') d limit 8;
insert into absence_days (user_id, day, type) values ('00000000-0000-0000-0000-000000000103', '2026-12-07', 'sick');

create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;
set local role authenticated;

-- Employee requests 3 more days → over 10 in 2 years
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
select request_leave('education', '2026-12-01', '2026-12-03');
select is((select used from type_usage('00000000-0000-0000-0000-000000000102', 'education', '2026-12-01')), 11::numeric,
  'usage counts 2025 and 2026 together');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
select results_eq($$select used, limit_days from request_limit_warnings()$$, $$values (11::numeric, 10::numeric)$$,
  'the admin is warned: 11 of 10 days');

-- Type management
select is((select label from save_absence_type('jury', 'SC', 'Schöffendienst', '--slate', 'request', false, false)),
  'Schöffendienst', 'the admin adds a new type');
select throws_ok($$select save_absence_type('jury_two', 'SC', 'Doppelt', '--slate', 'request', false, false)$$,
  'P0001', 'Das Zeichen „SC“ wird schon von einer anderen Art verwendet.', 'letters are unique');
select throws_ok($$select save_absence_type('vacation', 'U', 'Urlaub', '--urlaub', 'request', false, false)$$,
  'P0001', 'Bei „Urlaub“ können nur Bezeichnung und Farbe geändert werden.', 'fixed types keep their rules');
select lives_ok($$select delete_absence_type('jury')$$, 'an unused type can be deleted');
select throws_ok($$select delete_absence_type('education')$$,
  'P0001', '„Bildungsurlaub“ wird schon verwendet und kann nur ausgeblendet werden.', 'a used type cannot be deleted');

-- Hiding keeps old entries counting
select lives_ok($$select save_absence_type('education', 'BU', 'Bildungsurlaub', '--green', 'request', false, false, 10, 2::smallint, false, 60::smallint)$$,
  'the admin hides Bildungsurlaub');
select is((select count(*)::int from absence_days where type = 'education' and extract(year from day) = 2025), 8,
  'existing entries stay');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
select throws_ok($$select request_leave('education', '2026-12-08', '2026-12-08')$$,
  'P0001', 'Diese Abwesenheitsart kann nicht beantragt werden.', 'hidden types cannot be requested');

-- Range entry: Elternzeit for Tobi (Mon/Tue/Thu/Fri)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
insert into r values ('ez', set_absence_range('00000000-0000-0000-0000-000000000103', '2026-12-01', '2026-12-31', 'parental'));
select is((select (v ->> 'added')::int from r where k = 'ez'), 16,
  'December: 18 Mon/Tue/Thu/Fri minus 25.12. and the existing sick day = 16');
select is((select v -> 'skipped' ->> 0 from r where k = 'ez'), '2026-12-07', 'the sick day is skipped and listed');
select is(clear_absence_range('00000000-0000-0000-0000-000000000103', '2026-12-01', '2026-12-31', 'parental'), 16,
  'the range can be removed again');
select is((select count(*)::int from absence_days where user_id = '00000000-0000-0000-0000-000000000103'), 1,
  'only the sick day remains');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
select throws_ok($$select set_absence_range('00000000-0000-0000-0000-000000000102', '2026-12-01', '2026-12-31', 'parental')$$,
  '42501', 'Das darf nur die Praxisleitung.', 'employees cannot enter ranges');

select * from finish();
rollback;
