-- T7b Absence type management, type limits, admin range entry (R24, R25, R26).
-- The feature switches themselves are enforced inside the functions from T3–T7.

create function public.save_absence_type(
  p_code text, p_letter text, p_label text, p_color text, p_entry_mode text,
  p_deducts_vacation boolean, p_is_health boolean,
  p_limit_days numeric default null, p_limit_years smallint default null,
  p_visible boolean default true, p_sort smallint default 100)
returns public.absence_types
language plpgsql security definer set search_path = public as $$
declare
  res public.absence_types;
begin
  perform public.require_admin();
  begin
    insert into public.absence_types as t
      (code, letter, label, color, entry_mode, deducts_vacation, is_health, limit_days, limit_years, visible, sort)
    values (p_code, upper(btrim(p_letter)), btrim(p_label), p_color, p_entry_mode, p_deducts_vacation, p_is_health,
            p_limit_days, p_limit_years, p_visible, p_sort)
    on conflict (code) do update set
      letter = excluded.letter, label = excluded.label, color = excluded.color,
      entry_mode = excluded.entry_mode, deducts_vacation = excluded.deducts_vacation,
      is_health = excluded.is_health, limit_days = excluded.limit_days,
      limit_years = excluded.limit_years, visible = excluded.visible, sort = excluded.sort
    returning * into res;
  exception
    when unique_violation then
      raise exception 'Das Zeichen „%“ wird schon von einer anderen Art verwendet.', upper(btrim(p_letter));
    when check_violation then
      raise exception 'Bitte prüfen Sie die Angaben: Zeichen 1–2 Buchstaben, Grenze mit Tagen und Zeitraum.';
  end;
  return res;
end $$;

create function public.delete_absence_type(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  lbl text;
begin
  perform public.require_admin();
  select label into lbl from public.absence_types where code = p_code;
  begin
    delete from public.absence_types where code = p_code;
  exception when foreign_key_violation then
    raise exception '„%“ wird schon verwendet und kann nur ausgeblendet werden.', lbl;
  end;
end $$;

-- Days used of a type within its limit window (1 or 2 calendar years ending with as_of's year),
-- approved and pending together.
create function public.type_usage(p_user uuid, p_type text, p_as_of date default current_date)
returns table (used numeric, limit_days numeric, window_start date, window_end date)
language plpgsql stable security definer set search_path = public as $$
declare
  t public.absence_types;
  y int := extract(year from p_as_of)::int;
begin
  if not (p_user = auth.uid() or public.is_admin()) then
    raise exception 'Das darf nur die Praxisleitung.' using errcode = '42501';
  end if;
  select * into t from public.absence_types where code = p_type;
  if t.limit_days is null then return; end if;
  window_start := make_date(y - t.limit_years + 1, 1, 1);
  window_end := make_date(y, 12, 31);
  limit_days := t.limit_days;
  select coalesce(sum(amount), 0) into used from public.absence_days
   where user_id = p_user and type = p_type and day between window_start and window_end;
  return next;
end $$;

-- Pending requests that would go over their type's limit (warning only).
create function public.request_limit_warnings()
returns table (request_id uuid, type text, used numeric, limit_days numeric, window_start date, window_end date)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select r.id, r.type, u.used, u.limit_days, u.window_start, u.window_end
      from public.leave_requests r, lateral public.type_usage(r.user_id, r.type, r.start_date) u
     where r.status = 'pending' and u.used > u.limit_days;
end $$;

-- Admin enters a type for a whole range (e.g. Elternzeit), on working days only.
create function public.set_absence_range(p_user uuid, a date, b date, p_type text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.absence_types;
  n int;
  skipped jsonb;
begin
  perform public.require_admin();
  if a is null or b is null or b < a then raise exception 'Das Ende liegt vor dem Anfang.'; end if;
  if b - a > 400 then raise exception 'Ein Zeitraum darf höchstens 400 Tage lang sein.'; end if;
  select * into t from public.absence_types where code = p_type;
  if not found or not t.visible then
    raise exception 'Diese Abwesenheitsart ist ausgeblendet oder unbekannt.';
  end if;

  select coalesce(jsonb_agg(ad.day order by ad.day), '[]') into skipped
    from public.person_workdays(p_user, a, b) w
    join public.absence_days ad on ad.user_id = p_user and ad.day = w;

  with ins as (
    insert into public.absence_days (user_id, day, type, status)
    select p_user, w, p_type, 'approved' from public.person_workdays(p_user, a, b) w
    on conflict (user_id, day) do nothing
    returning 1)
  select count(*) into n from ins;
  return jsonb_build_object('added', n, 'skipped', skipped);
end $$;

create function public.clear_absence_range(p_user uuid, a date, b date, p_type text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform public.require_admin();
  delete from public.absence_days
   where user_id = p_user and type = p_type and day between a and b
     and request_id is null and status = 'approved';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function
  public.save_absence_type(text, text, text, text, text, boolean, boolean, numeric, smallint, boolean, smallint),
  public.delete_absence_type(text), public.type_usage(uuid, text, date), public.request_limit_warnings(),
  public.set_absence_range(uuid, date, date, text), public.clear_absence_range(uuid, date, date, text)
  from public, anon;
grant execute on function
  public.save_absence_type(text, text, text, text, text, boolean, boolean, numeric, smallint, boolean, smallint),
  public.delete_absence_type(text), public.type_usage(uuid, text, date), public.request_limit_warnings(),
  public.set_absence_range(uuid, date, date, text), public.clear_absence_range(uuid, date, date, text)
  to authenticated;
