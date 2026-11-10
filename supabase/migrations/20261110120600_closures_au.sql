-- T7 Practice closures and AU tracking (R16, R17).

create table public.closure_days (
  day date primary key,
  note text check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.closure_days enable row level security;
create policy closures_read on public.closure_days for select to authenticated using (true);
create trigger audit_closures after insert or update or delete on public.closure_days
  for each row execute function public.audit_row('day');

-- Enter a closure once: B days for every active person on their working days.
-- Safe to repeat; days that already hold another entry are skipped and listed.
create function public.set_closure(a date, b date, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_days int;
  n_added int;
  conflicts jsonb;
begin
  perform public.require_admin();
  if a is null or b is null or b < a then raise exception 'Das Ende liegt vor dem Anfang.'; end if;
  if b - a > 31 then raise exception 'Eine Schließung darf höchstens 31 Tage lang sein.'; end if;

  insert into public.closure_days (day, note)
  select d::date, nullif(btrim(p_note), '') from generate_series(a, b, interval '1 day') d
   where extract(isodow from d) <= 5 and not public.is_holiday(d::date)
  on conflict (day) do update set note = excluded.note;
  get diagnostics n_days = row_count;

  with ins as (
    insert into public.absence_days (user_id, day, type, status)
    select p.id, w, 'closure', 'approved'
      from public.profiles p, lateral public.person_workdays(p.id, a, b) w
     where p.active
    on conflict (user_id, day) do nothing
    returning 1)
  select count(*) into n_added from ins;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'full_name', p.full_name,
                                              'day', ad.day, 'type', ad.type) order by p.full_name, ad.day), '[]')
    into conflicts
    from public.absence_days ad join public.profiles p on p.id = ad.user_id
   where ad.day between a and b and ad.type <> 'closure' and p.active;

  return jsonb_build_object('closure_days', n_days, 'added', n_added, 'conflicts', conflicts);
end $$;

create function public.remove_closure(a date, b date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform public.require_admin();
  delete from public.absence_days where type = 'closure' and request_id is null and day between a and b;
  get diagnostics n = row_count;
  delete from public.closure_days where day between a and b;
  return jsonb_build_object('removed', n);
end $$;

-- ---------------------------------------------------------------- AU tracking
create function public.is_sick_type(t text) returns boolean
language sql immutable as $$ select t in ('sick', 'child_sick') $$;

-- All approved sick days of a person, grouped into runs: two sick days belong together
-- when only non-working days lie between them.
create function public.sick_runs(p_user uuid)
returns table (start_date date, end_date date, days int, missing int)
language plpgsql stable security definer set search_path = public as $$
declare
  rec record;
  s date; e date; n int := 0; m int := 0;
begin
  for rec in
    select day, au_received from public.absence_days
     where user_id = p_user and status = 'approved' and public.is_sick_type(type)
     order by day
  loop
    if s is not null and exists (select 1 from public.person_workdays(p_user, e + 1, rec.day - 1)) then
      start_date := s; end_date := e; days := n; missing := m; return next;
      s := null;
    end if;
    if s is null then s := rec.day; n := 0; m := 0; end if;
    e := rec.day; n := n + 1;
    if not rec.au_received then m := m + 1; end if;
  end loop;
  if s is not null then
    start_date := s; end_date := e; days := n; missing := m; return next;
  end if;
end $$;

-- "AU liegt vor" applies to the whole run that contains this day.
create function public.set_au(p_user uuid, p_day date, p_received boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare
  run record;
  n int;
begin
  perform public.require_admin();
  if not (select au_tracking from public.app_settings) then
    raise exception 'Die AU-Kontrolle ist in den Einstellungen ausgeschaltet.';
  end if;
  select * into run from public.sick_runs(p_user) r where p_day between r.start_date and r.end_date;
  if not found or not exists (select 1 from public.absence_days where user_id = p_user and day = p_day
                                and public.is_sick_type(type)) then
    raise exception 'An diesem Tag ist keine Krankheit eingetragen.';
  end if;
  update public.absence_days set au_received = p_received
   where user_id = p_user and status = 'approved' and public.is_sick_type(type)
     and day between run.start_date and run.end_date;
  get diagnostics n = row_count;
  return n;
end $$;

-- Runs longer than 3 calendar days (§5 EFZG) that still have days without an AU.
create function public.missing_au()
returns table (user_id uuid, full_name text, start_date date, end_date date, days int, missing int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  if not (select au_tracking from public.app_settings) then return; end if;
  return query
    select p.id, p.full_name, r.start_date, r.end_date, r.days, r.missing
      from public.profiles p, lateral public.sick_runs(p.id) r
     where r.missing > 0 and r.end_date - r.start_date + 1 > 3
     order by r.start_date desc, p.full_name;
end $$;

revoke execute on function public.set_closure(date, date, text), public.remove_closure(date, date),
  public.is_sick_type(text), public.sick_runs(uuid), public.set_au(uuid, date, boolean),
  public.missing_au() from public, anon;
grant execute on function public.set_closure(date, date, text), public.remove_closure(date, date),
  public.set_au(uuid, date, boolean), public.missing_au() to authenticated;
