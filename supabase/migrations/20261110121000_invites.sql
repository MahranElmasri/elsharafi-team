-- T9b Invite links and password reset (R23). Only the server (service role) uses these.
-- The app makes the token; the database only ever sees its sha256 hash.

create table public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('invite', 'reset')),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index invite_tokens_user on public.invite_tokens (user_id, created_at desc);

-- RLS on and no policies: nobody but the service role can read or write tokens.
alter table public.invite_tokens enable row level security;
revoke all on public.invite_tokens from anon, authenticated;

-- New link for a person; every older unused link of theirs stops working.
create function public.create_invite(p_user uuid, p_purpose text, p_hash text, p_by uuid default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  exp timestamptz;
begin
  if not exists (select 1 from public.profiles where id = p_user and active) then
    raise exception 'Für ein deaktiviertes Konto kann keine Einladung erstellt werden.';
  end if;
  update public.invite_tokens set used_at = now() where user_id = p_user and used_at is null;
  insert into public.invite_tokens (user_id, token_hash, purpose, created_by)
  values (p_user, p_hash, p_purpose, p_by)
  returning expires_at into exp;
  return exp;
end $$;

-- "Passwort vergessen": stores the reset link and returns where to email it, or nothing
-- when the username is unknown, deactivated, has no email, or asked within 15 minutes.
-- The page answers the same way in every case.
create function public.request_reset(p_username text, p_hash text)
returns table (user_id uuid, full_name text, email text)
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles
   where username = lower(btrim(p_username)) and active and notify_email is not null;
  if not found then return; end if;
  if exists (select 1 from public.invite_tokens t
              where t.user_id = p.id and t.purpose = 'reset'
                and t.created_at > now() - interval '15 minutes') then
    return;
  end if;
  perform public.create_invite(p.id, 'reset', p_hash, null);
  user_id := p.id; full_name := p.full_name; email := p.notify_email;
  return next;
end $$;

-- Why a link cannot be used ('ok' when it can). Read-only, for showing the right page.
create function public.peek_invite(p_hash text)
returns table (status text, full_name text, purpose text)
language sql stable security definer set search_path = public as $$
  select case when t.id is null then 'unknown'
              when t.used_at is not null then 'used'
              when t.expires_at <= now() then 'expired'
              when not p.active then 'inactive'
              else 'ok' end,
         case when t.used_at is null and t.expires_at > now() and p.active then p.full_name end,
         t.purpose
    from (select 1) x
    left join public.invite_tokens t on t.token_hash = p_hash
    left join public.profiles p on p.id = t.user_id;
$$;

-- Uses up a valid link in one atomic step and returns its owner, or nothing.
create function public.redeem_invite(p_hash text)
returns table (user_id uuid, role text)
language sql security definer set search_path = public as $$
  update public.invite_tokens t set used_at = now()
    from public.profiles p
   where t.token_hash = p_hash and t.used_at is null and t.expires_at > now()
     and p.id = t.user_id and p.active
  returning t.user_id, p.role;
$$;

revoke execute on function public.create_invite(uuid, text, text, uuid), public.request_reset(text, text),
  public.peek_invite(text), public.redeem_invite(text) from public, anon, authenticated;
grant execute on function public.create_invite(uuid, text, text, uuid), public.request_reset(text, text),
  public.peek_invite(text), public.redeem_invite(text) to service_role;
