-- T1 Core schema: teams, absence types, settings, profiles, admin check, base RLS.
-- Reference data (teams, absence types, settings row) lives here, not in seed.sql,
-- because seed.sql never runs on production.

-- ---------------------------------------------------------------- teams
create table public.teams (
  id text primary key check (id in ('arbeiter', 'aerzte', 'verwaltung')),
  name text not null,
  sort smallint not null,
  max_absent smallint not null default 1 check (max_absent >= 0)
);

insert into public.teams (id, name, sort, max_absent) values
  ('arbeiter', 'Arbeiter', 1, 2),
  ('aerzte', 'Ärzte', 2, 1),
  ('verwaltung', 'Verwaltung', 3, 1);

-- ---------------------------------------------------------------- absence types
create table public.absence_types (
  code text primary key check (code ~ '^[a-z_]{2,32}$'),
  letter text not null unique check (char_length(letter) between 1 and 2),
  label text not null check (char_length(label) between 1 and 60),
  color text not null check (color ~ '^--[a-z0-9-]+$'),
  entry_mode text not null check (entry_mode in ('request', 'report', 'admin')),
  deducts_vacation boolean not null default false,
  is_health boolean not null default false,
  limit_days numeric(4, 1) check (limit_days > 0),
  limit_years smallint check (limit_years in (1, 2)),
  visible boolean not null default true,
  is_fixed boolean not null default false,
  sort smallint not null default 100,
  check ((limit_days is null) = (limit_years is null))
);

insert into public.absence_types
  (code, letter, label, color, entry_mode, deducts_vacation, is_health, limit_days, limit_years, is_fixed, sort)
values
  ('vacation',        'U',  'Urlaub',                            '--urlaub', 'request', true,  false, null, null, true,  10),
  ('closure',         'B',  'Betriebsurlaub',                    '--urlaub', 'admin',   true,  false, null, null, true,  20),
  ('sick',            'X',  'Krank',                             '--krank',  'report',  false, true,  null, null, true,  30),
  ('child_sick',      'K',  'Kind krank',                        '--krank',  'report',  false, true,  null, null, false, 40),
  ('training',        'F',  'Fortbildung',                       '--green',  'request', false, false, null, null, false, 50),
  ('education',       'BU', 'Bildungsurlaub',                    '--green',  'request', false, false, 10,   2,    false, 60),
  ('special_wedding', 'SH', 'Sonderurlaub Hochzeit',             '--violet', 'request', false, false, 1,    1,    false, 70),
  ('special_birth',   'SG', 'Sonderurlaub Geburt eines Kindes',  '--violet', 'request', false, false, 1,    1,    false, 71),
  ('special_death',   'ST', 'Sonderurlaub Todesfall',            '--violet', 'request', false, false, 2,    1,    false, 72),
  ('special_move',    'SU', 'Sonderurlaub Umzug',                '--violet', 'request', false, false, 1,    1,    false, 73),
  ('special_other',   'S',  'Sonderurlaub sonstige',             '--violet', 'request', false, false, null, null, false, 74),
  ('overtime',        'Ü',  'Überstundenabbau',                  '--slate',  'request', false, false, null, null, false, 80),
  ('unpaid',          'UU', 'Unbezahlter Urlaub',                '--brown',  'request', false, false, null, null, false, 90),
  ('parental',        'EZ', 'Elternzeit',                        '--slate',  'admin',   false, false, null, null, false, 100),
  ('maternity',       'MS', 'Mutterschutz',                      '--violet', 'admin',   false, true,  null, null, false, 110);

-- Codes never change; fixed types keep their rules and can't be hidden or deleted (R25).
create function public.guard_absence_type() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_fixed then
      raise exception 'Die Art „%“ ist fest und kann nicht gelöscht werden.', old.label;
    end if;
    return old;
  end if;
  if new.code <> old.code then
    raise exception 'Das Kürzel einer Abwesenheitsart kann nicht geändert werden.';
  end if;
  if new.is_fixed <> old.is_fixed then
    raise exception 'Ob eine Art fest ist, kann nicht geändert werden.';
  end if;
  if old.is_fixed and (new.entry_mode, new.deducts_vacation, new.is_health, new.visible)
                   is distinct from (old.entry_mode, old.deducts_vacation, old.is_health, old.visible) then
    raise exception 'Bei „%“ können nur Bezeichnung und Farbe geändert werden.', old.label;
  end if;
  return new;
end $$;

create trigger absence_types_guard
  before update or delete on public.absence_types
  for each row execute function public.guard_absence_type();

-- ---------------------------------------------------------------- settings (one row)
create table public.app_settings (
  id boolean primary key default true check (id),
  team_calendar boolean not null default true,
  half_days boolean not null default true,
  substitutes boolean not null default true,
  au_tracking boolean not null default true
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  full_name text not null check (char_length(full_name) between 1 and 80),
  notify_email text check (notify_email ~ '^[^@\s]+@[^@\s]+$'),
  role text not null default 'employee' check (role in ('admin', 'employee')),
  team_id text not null references public.teams (id),
  active boolean not null default true,
  workdays smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(workdays) between 1 and 5 and workdays <@ '{1,2,3,4,5}'::smallint[]),
  start_date date not null default current_date,
  end_date date check (end_date is null or end_date >= start_date),
  sort smallint not null default 100,
  created_at timestamptz not null default now()
);

-- Accounts are created only by the server (admin API). Role comes from app_metadata,
-- which only the server can set; everything else from user_metadata.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
begin
  insert into public.profiles (id, username, full_name, notify_email, role, team_id, workdays, start_date)
  values (
    new.id,
    lower(meta ->> 'username'),
    meta ->> 'full_name',
    case when new.email like '%@users.mvz-elsharafi.invalid' then null else new.email end,
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'employee' end,
    meta ->> 'team',
    coalesce((select array_agg(x::smallint) from jsonb_array_elements_text(meta -> 'workdays') x),
             '{1,2,3,4,5}'),
    coalesce((meta ->> 'start_date')::date, current_date)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- An admin can't lock themselves out (R19).
create function public.guard_profile_self() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id = auth.uid() and old.role = 'admin' and (not new.active or new.role <> 'admin') then
    raise exception 'Sie können sich nicht selbst deaktivieren oder Ihre Admin-Rolle entfernen.';
  end if;
  return new;
end $$;

create trigger profiles_guard_self
  before update on public.profiles
  for each row execute function public.guard_profile_self();

-- ---------------------------------------------------------------- RLS
alter table public.teams enable row level security;
alter table public.absence_types enable row level security;
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;

create policy teams_read on public.teams for select to authenticated using (true);
create policy teams_admin_update on public.teams for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy types_read on public.absence_types for select to authenticated using (true);

create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_admin_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Functions: nobody anonymous.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin(), public.is_active_user() to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
