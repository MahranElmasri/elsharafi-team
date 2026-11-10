-- T9b Invite links and password reset (R23)
begin;
select plan(15);

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000401', 'anna@example.org',
   '{"username":"anna","full_name":"Anna","team":"arbeiter"}', '{}'),
  ('00000000-0000-0000-0000-000000000402', 'bert@users.mvz-elsharafi.invalid',
   '{"username":"bert","full_name":"Bert","team":"arbeiter"}', '{}');

-- Employees can neither read tokens nor call the functions
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}', true);
select throws_ok($$select * from invite_tokens$$, '42501', null, 'employees cannot read tokens');
select throws_ok($$select * from peek_invite(repeat('a', 64))$$, '42501', null, 'employees cannot check links');

reset role;
set local role service_role;

-- Invite: a new link replaces the old one
select is(create_invite('00000000-0000-0000-0000-000000000402', 'invite', repeat('1', 64)) - now(),
  interval '7 days', 'an invite is valid for 7 days');
select lives_ok($$select create_invite('00000000-0000-0000-0000-000000000402', 'invite', repeat('2', 64))$$,
  'a second invite for the same person');
select is((select status from peek_invite(repeat('1', 64))), 'used', 'the older link stops working');
select results_eq($$select status, full_name from peek_invite(repeat('2', 64))$$,
  $$values ('ok', 'Bert')$$, 'the new link is valid and names its owner');
select is((select status from peek_invite(repeat('9', 64))), 'unknown', 'an unknown link is refused');

-- Redeem once
select results_eq($$select role from redeem_invite(repeat('2', 64))$$, $$values ('employee')$$,
  'redeeming returns the owner');
select is((select count(*)::int from redeem_invite(repeat('2', 64))), 0, 'a used link cannot be redeemed again');

-- Expired and deactivated
select create_invite('00000000-0000-0000-0000-000000000402', 'invite', repeat('3', 64));
update invite_tokens set expires_at = now() - interval '1 second' where token_hash = repeat('3', 64);
select is((select status from peek_invite(repeat('3', 64))), 'expired', 'an expired link is refused');
select is((select count(*)::int from redeem_invite(repeat('3', 64))), 0, 'an expired link cannot be redeemed');
select create_invite('00000000-0000-0000-0000-000000000402', 'invite', repeat('4', 64));
update profiles set active = false where username = 'bert';
select is((select status from peek_invite(repeat('4', 64))), 'inactive', 'a deactivated account''s link is refused');

-- Passwort vergessen
select results_eq($$select email from request_reset(' Anna ', repeat('5', 64))$$,
  $$values ('anna@example.org')$$, 'a reset link is made for an account with an email');
select is((select count(*)::int from request_reset('anna', repeat('6', 64))), 0,
  'a second request within 15 minutes does nothing');
select is((select count(*)::int from request_reset('niemand', repeat('7', 64)))
        + (select count(*)::int from request_reset('bert', repeat('8', 64))), 0,
  'unknown, deactivated or email-less accounts get nothing');

select * from finish();
rollback;
