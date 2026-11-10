-- Role from app_metadata reaches the profile even when set after the insert (R1, R19)
begin;
select plan(3);

-- Start from an empty practice; everything is rolled back at the end, so local data is untouched.
delete from absence_days; delete from leave_requests; delete from closure_days; delete from audit_log;
delete from auth.users;

-- What the admin API does: insert without a role, then set app_metadata.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000301', 'neu@example.org',
   '{"username":"neuadmin","full_name":"Neue Leitung","team":"verwaltung"}', '{"provider":"email"}');
select is((select role from profiles where username = 'neuadmin'), 'employee', 'no role yet: employee');

update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
 where id = '00000000-0000-0000-0000-000000000301';
select is((select role from profiles where username = 'neuadmin'), 'admin', 'app_metadata.role admin makes the profile admin');

update auth.users set raw_app_meta_data = raw_app_meta_data - 'role'
 where id = '00000000-0000-0000-0000-000000000301';
select is((select role from profiles where username = 'neuadmin'), 'employee', 'removing the role demotes the profile');

select * from finish();
rollback;
