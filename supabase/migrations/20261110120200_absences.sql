-- T3 Absence days, day notes, audit log (R2, R4, R20).

-- ---------------------------------------------------------------- audit log
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid default auth.uid(),
  table_name text not null,
  row_key text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old jsonb,
  new jsonb,
  at timestamptz not null default now()
);
create index audit_log_row on public.audit_log (table_name, row_key);
create index audit_log_at on public.audit_log (at desc);

-- Generic row audit. Trigger arguments name the key columns, e.g. ('user_id', 'day').
create function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  k text;
begin
  select string_agg(rec ->> col, '|') into k from unnest(tg_argv) as col;
  insert into public.audit_log (table_name, row_key, action, old, new)
  values (tg_table_name, k, tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end $$;

alter table public.audit_log enable row level security;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());

create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row('id');
create trigger audit_settings after update on public.app_settings
  for each row execute function public.audit_row('id');
create trigger audit_types after insert or update or delete on public.absence_types
  for each row execute function public.audit_row('code');
create trigger audit_teams after update on public.teams
  for each row execute function public.audit_row('id');

-- ---------------------------------------------------------------- absence days
create table public.absence_days (
  user_id uuid not null references public.profiles (id) on delete restrict,
  day date not null,
  type text not null references public.absence_types (code) on delete restrict,
  amount numeric(2, 1) not null default 1 check (amount in (0.5, 1)),
  half text check (half in ('am', 'pm')),
  status text not null default 'approved' check (status in ('pending', 'approved')),
  request_id uuid,               -- foreign key added with leave_requests (T5)
  au_received boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (user_id, day),
  check ((half is null) = (amount = 1))
);
create index absence_days_day on public.absence_days (day);

-- Only the person's own working days can hold an entry (R5, R6).
create function public.guard_absence_day() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  if new.day is distinct from old.day or new.user_id is distinct from old.user_id or tg_op = 'INSERT' then
    if public.is_holiday(new.day) then
      raise exception 'Der % ist ein Feiertag. An Feiertagen wird nichts eingetragen.', to_char(new.day, 'DD.MM.YYYY');
    end if;
    if not exists (select 1 from public.person_workdays(new.user_id, new.day, new.day)) then
      select full_name into who from public.profiles where id = new.user_id;
      raise exception '% arbeitet am % nicht.', coalesce(who, 'Diese Person'), to_char(new.day, 'DD.MM.YYYY');
    end if;
  end if;
  return new;
end $$;

create trigger absence_days_guard
  before insert or update on public.absence_days
  for each row execute function public.guard_absence_day();
create trigger audit_absence_days after insert or update or delete on public.absence_days
  for each row execute function public.audit_row('user_id', 'day');

alter table public.absence_days enable row level security;
create policy absence_read on public.absence_days for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------- day notes (admin only)
create table public.day_notes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  note text not null check (char_length(note) between 1 and 500),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.day_notes enable row level security;
create policy notes_admin_read on public.day_notes for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- admin grid writes
create function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Das darf nur die Praxisleitung.' using errcode = '42501';
  end if;
end $$;

-- The admin's grid click and context menu. p_type null removes the entry.
create function public.set_absence(p_user uuid, p_day date, p_type text, p_half text default null)
returns public.absence_days
language plpgsql security definer set search_path = public as $$
declare
  t public.absence_types;
  cur public.absence_days;
  res public.absence_days;
begin
  perform public.require_admin();
  select * into cur from public.absence_days where user_id = p_user and day = p_day for update;

  if cur.status = 'pending' then
    raise exception 'Für diesen Tag liegt ein offener Antrag vor. Entscheiden Sie im Antrag.';
  end if;

  if p_type is null then
    delete from public.absence_days where user_id = p_user and day = p_day;
    return null;
  end if;

  select * into t from public.absence_types where code = p_type;
  if not found then
    raise exception 'Unbekannte Abwesenheitsart.';
  end if;
  if not t.visible and (cur.type is distinct from p_type) then
    raise exception '„%“ ist ausgeblendet und kann nicht neu eingetragen werden.', t.label;
  end if;
  if p_half is not null and not (select half_days from public.app_settings) then
    raise exception 'Halbe Tage sind in den Einstellungen ausgeschaltet.';
  end if;

  insert into public.absence_days as a (user_id, day, type, amount, half, status)
  values (p_user, p_day, p_type, case when p_half is null then 1 else 0.5 end, p_half, 'approved')
  on conflict (user_id, day) do update
    set type = excluded.type, amount = excluded.amount, half = excluded.half,
        status = 'approved', request_id = null,
        au_received = case when a.type = excluded.type then a.au_received else false end
  returning * into res;
  return res;
end $$;

create function public.set_note(p_user uuid, p_day date, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if nullif(btrim(p_note), '') is null then
    delete from public.day_notes where user_id = p_user and day = p_day;
  else
    insert into public.day_notes (user_id, day, note) values (p_user, p_day, btrim(p_note))
    on conflict (user_id, day) do update
      set note = excluded.note, updated_by = auth.uid(), updated_at = now();
  end if;
end $$;

revoke execute on function public.audit_row(), public.guard_absence_day(), public.require_admin(),
  public.set_absence(uuid, date, text, text), public.set_note(uuid, date, text) from public, anon;
grant execute on function public.set_absence(uuid, date, text, text), public.set_note(uuid, date, text)
  to authenticated;
