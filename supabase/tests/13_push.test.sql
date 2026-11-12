-- T15c Push subscriptions and the notifications → /api/push trigger (R27)
begin;
select plan(15);

delete from absence_days; delete from leave_requests; delete from day_notes; delete from audit_log;
delete from auth.users;
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000001301', 'anna@example.org',
   '{"username":"anna","full_name":"Anna","team":"arbeiter","start_date":"2020-01-01"}', '{}'),
  ('00000000-0000-0000-0000-000000001302', 'bert@example.org',
   '{"username":"bert","full_name":"Bert","team":"arbeiter","start_date":"2020-01-01"}', '{}');

select ok((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass),
  'push_subscriptions has RLS on');

-- Anna subscribes her phone.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000001301","role":"authenticated"}', true);
select lives_ok($$select save_push_subscription('https://push.example/phone-1', 'key', 'secret')$$,
  'a person can save this device');
select is((select count(*)::int from push_subscriptions), 1, 'and sees it');
select throws_ok($$select save_push_subscription('http://push.example/x', 'key', 'secret')$$,
  'P0001', 'Dieses Gerät hat keine gültige Push-Adresse geliefert.', 'only https endpoints');
select throws_ok($$insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-000000001302', 'https://push.example/fake', 'k', 'a')$$,
  '42501', null, 'no direct inserts, so nobody can subscribe a device for someone else');
select throws_ok($$select call_app_endpoint('/api/push', '{}')$$, '42501', null,
  'signed-in people cannot call app endpoints');

-- Bert signs in on the same phone: the device moves to him.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000001302","role":"authenticated"}', true);
select is((select count(*)::int from push_subscriptions), 0, 'Bert does not see Anna''s device');
select save_push_subscription('https://push.example/phone-1', 'key2', 'secret2');
select is((select count(*)::int from push_subscriptions), 1, 'after subscribing, the phone is Bert''s');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000001301","role":"authenticated"}', true);
select is((select count(*)::int from push_subscriptions), 0, 'and no longer Anna''s');
select delete_push_subscription('https://push.example/phone-1');
reset role;
select is((select count(*)::int from push_subscriptions), 1, 'Anna cannot remove Bert''s device');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000001302","role":"authenticated"}', true);
select delete_push_subscription('https://push.example/phone-1');
reset role;
select is((select count(*)::int from push_subscriptions), 0, 'Bert can remove his own device');

-- The trigger hands new notifications to /api/push.
insert into push_subscriptions (user_id, endpoint, p256dh, auth)
values ('00000000-0000-0000-0000-000000001302', 'https://push.example/phone-2', 'k', 'a');
-- Start without the Vault values (a local setup may have them; rolled back at the end).
delete from vault.secrets where name in ('app_url', 'cron_secret');
create temp table before_count as select count(*) as n from net.http_request_queue;

insert into notifications (user_id, message) values ('00000000-0000-0000-0000-000000001302', 'ohne Vault');
select is((select count(*) from net.http_request_queue), (select n from before_count),
  'without app_url and cron_secret in Vault nothing is sent');

select vault.create_secret('http://app.test', 'app_url');
select vault.create_secret('s3cret', 'cron_secret');
insert into notifications (user_id, message) values ('00000000-0000-0000-0000-000000001301', 'Anna hat kein Gerät');
select is((select count(*) from net.http_request_queue), (select n from before_count),
  'nothing is sent when no recipient has a device');

insert into notifications (user_id, message) values
  ('00000000-0000-0000-0000-000000001301', 'an Anna'),
  ('00000000-0000-0000-0000-000000001302', 'an Bert');
select is((select count(*) from net.http_request_queue), (select n from before_count) + 1,
  'one call per statement');
select results_eq(
  $$select q.url, q.headers ->> 'Authorization',
           (convert_from(q.body, 'utf8')::jsonb -> 'ids') = (select jsonb_agg(id) from notifications where message = 'an Bert')
      from net.http_request_queue q order by q.id desc limit 1$$,
  $$values ('http://app.test/api/push', 'Bearer s3cret', true)$$,
  'it posts only the subscribed person''s notification id to /api/push with the secret');

select * from finish();
rollback;
