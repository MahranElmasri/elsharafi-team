-- The admin API (auth.admin.createUser) inserts the user first and writes app_metadata
-- in a second update, so the insert trigger sees no role. Keep profiles.role in step
-- with app_metadata.role, which only the service role can change.
create function public.sync_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set role = case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'employee' end
   where id = new.id;
  return new;
end $$;

revoke execute on function public.sync_profile_role() from public, anon, authenticated;

create trigger on_auth_user_role_changed
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data ->> 'role' is distinct from new.raw_app_meta_data ->> 'role')
  execute function public.sync_profile_role();
