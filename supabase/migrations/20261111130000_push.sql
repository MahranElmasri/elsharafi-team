-- T15c Push notifications to phones (R27).
-- Each device that opts in stores its Web Push subscription here. A trigger on notifications
-- hands new rows to the app's /api/push route, which sends them with web-push.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
-- Read own rows only; writes go through the two functions below.
create policy push_subscriptions_read on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

-- Saves this device for the signed-in person. A device (endpoint) belongs to whoever
-- signed in on it last, so a shared phone never pushes to the previous person.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Bitte melden Sie sich an.';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 1 and 200
     or coalesce(length(p_auth), 0) not between 1 and 100 then
    raise exception 'Dieses Gerät hat keine gültige Push-Adresse geliefert.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

create function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- POSTs a JSON body to {app_url}{path} with Bearer {cron_secret}, both from Vault.
-- Returns the pg_net request id, or null (and does nothing) until both secrets exist.
create function public.call_app_endpoint(p_path text, p_body jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  url text;
  secret text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if url is null or secret is null then
    return null;
  end if;
  return net.http_post(
    url := rtrim(url, '/') || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := p_body);
end $$;

create or replace function public.call_reminders_endpoint() returns bigint
language sql security definer set search_path = public as $$
  select public.call_app_endpoint('/api/cron/reminders', '{}'::jsonb);
$$;

-- One call per insert statement, only for rows whose person has a device subscribed.
-- pg_net sends after commit, so a rolled-back action pushes nothing and a slow push never
-- delays the action.
create function public.push_new_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  select array_agg(n.id) into ids
    from new_rows n
   where exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id);
  if ids is not null then
    perform public.call_app_endpoint('/api/push', jsonb_build_object('ids', ids));
  end if;
  return null;
end $$;

create trigger notifications_push after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.push_new_notifications();

revoke execute on function public.save_push_subscription(text, text, text),
  public.delete_push_subscription(text), public.call_app_endpoint(text, jsonb),
  public.call_reminders_endpoint(), public.push_new_notifications() from public, anon;
revoke execute on function public.call_app_endpoint(text, jsonb), public.call_reminders_endpoint(),
  public.push_new_notifications() from authenticated;
grant execute on function public.save_push_subscription(text, text, text),
  public.delete_push_subscription(text) to authenticated;
