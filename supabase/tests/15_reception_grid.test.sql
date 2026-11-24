-- T17i Reception emails for overview entries (R18, v1.19)
begin;
select plan(11);
update public.app_settings set half_days = true;

delete from absence_days; delete from leave_requests; delete from notify_recipients; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'leitung@example.org',
   '{"username":"leitung","full_name":"Praxis Leitung","team":"verwaltung","start_date":"2020-01-01"}', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'anna@example.org',
   '{"username":"anna","full_name":"Dr. Anna","team":"aerzte","start_date":"2020-01-01"}', '{}');
insert into notify_recipients (email) values ('empfang@example.org'), ('zweite@example.org');
create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;
-- The reception emails (to any address) in one result, as "to|text".
create function pg_temp.reception(res jsonb) returns setof text language sql as $$
  select (e ->> 'to') || '|' || (e ->> 'text') from jsonb_array_elements(res -> 'emails') e
   where e ->> 'to' in ('empfang@example.org', 'zweite@example.org') order by 1;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

-- A grid click on an empty day: every address is told at once.
insert into r values ('cell', set_absence('00000000-0000-0000-0000-0000000000f2', '2026-12-01', 'sick'));
select results_eq($$select pg_temp.reception(v) from r where k = 'cell'$$,
  $$values ('empfang@example.org|Dr. Anna ist am 1.12.2026 nicht in der Praxis.'),
           ('zweite@example.org|Dr. Anna ist am 1.12.2026 nicht in der Praxis.')$$,
  'a new grid day tells every address');
select ok((select (v -> 'emails')::text !~* 'krank|sick' from r where k = 'cell'), 'no type reaches the reception');
select is((select v -> 'day' ->> 'status' from r where k = 'cell'), 'approved', 'the entered day comes back');

-- Clicking again changes the type only: nothing new.
insert into r values ('change', set_absence('00000000-0000-0000-0000-0000000000f2', '2026-12-01', 'vacation'));
select is((select count(*)::int from r, pg_temp.reception(v) where k = 'change'), 0, 'a type change sends nothing');
insert into r values ('half', set_absence('00000000-0000-0000-0000-0000000000f2', '2026-12-01', 'vacation', 'am'));
select is((select count(*)::int from r, pg_temp.reception(v) where k = 'half'), 0, 'a half-day change sends nothing');

-- Removing the day: in the practice after all.
insert into r values ('remove', set_absence('00000000-0000-0000-0000-0000000000f2', '2026-12-01', null));
select results_eq($$select x from r, pg_temp.reception(v) x where k = 'remove' and x like 'empfang%'$$,
  $$values ('empfang@example.org|Dr. Anna ist am 1.12.2026 doch in der Praxis. Die Abwesenheit wurde storniert.')$$,
  'removing a grid day tells the reception');
insert into r values ('remove2', set_absence('00000000-0000-0000-0000-0000000000f2', '2026-12-01', null));
select is((select count(*)::int from r, pg_temp.reception(v) where k = 'remove2'), 0, 'removing an empty day sends nothing');

-- A range: one email per address, first to last day added (9.12. already entered).
select set_absence('00000000-0000-0000-0000-0000000000f2', '2026-12-09', 'sick');
insert into r values ('range', set_absence_range('00000000-0000-0000-0000-0000000000f2', '2026-12-05', '2026-12-13', 'vacation'));
select results_eq($$select pg_temp.reception(v) from r where k = 'range'$$,
  $$values ('empfang@example.org|Dr. Anna ist vom 7.12. bis 11.12.2026 nicht in der Praxis.'),
           ('zweite@example.org|Dr. Anna ist vom 7.12. bis 11.12.2026 nicht in der Praxis.')$$,
  'a range tells every address once, from the first to the last day added');
insert into r values ('range2', set_absence_range('00000000-0000-0000-0000-0000000000f2', '2026-12-07', '2026-12-11', 'vacation'));
select is((select count(*)::int from r, pg_temp.reception(v) where k = 'range2'), 0, 'a range with nothing new sends nothing');

-- Clearing a range: in the practice after all, for the days removed.
insert into r values ('clear', clear_absence_range('00000000-0000-0000-0000-0000000000f2', '2026-12-01', '2026-12-31', 'vacation'));
select results_eq($$select (v ->> 'removed')::int, x from r, pg_temp.reception(v) x where k = 'clear' and x like 'empfang%'$$,
  $$values (4, 'empfang@example.org|Dr. Anna ist vom 7.12. bis 11.12.2026 doch in der Praxis. Die Abwesenheit wurde storniert.')$$,
  'clearing a range tells the reception');
insert into r values ('clear2', clear_absence_range('00000000-0000-0000-0000-0000000000f2', '2026-12-01', '2026-12-31', 'vacation'));
select is((select count(*)::int from r, pg_temp.reception(v) where k = 'clear2'), 0, 'clearing nothing sends nothing');

select * from finish();
rollback;
