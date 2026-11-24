-- T17i Reception emails for overview entries (R18, v1.19): when the admin enters or removes an
-- absence in the overview, the reception is told too, as for a sick report or an approved leave.
-- Name and dates only (reception_notice). A type or half change of an entered day sends nothing.
-- set_absence and clear_absence_range now return jsonb, so they are dropped and created again.

drop function public.set_absence(uuid, date, text, text);

-- Body otherwise unchanged from 20261110120200_absences.sql.
create function public.set_absence(p_user uuid, p_day date, p_type text, p_half text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.absence_types;
  cur public.absence_days;
  res public.absence_days;
  who text;
begin
  perform public.require_admin();
  select * into cur from public.absence_days where user_id = p_user and day = p_day for update;
  select full_name into who from public.profiles where id = p_user;

  if cur.status = 'pending' then
    raise exception 'Für diesen Tag liegt ein offener Antrag vor. Entscheiden Sie im Antrag.';
  end if;

  if p_type is null then
    delete from public.absence_days where user_id = p_user and day = p_day;
    return jsonb_build_object('day', null, 'emails',
      case when found then public.reception_notice(who, p_day, p_day, false) else '[]'::jsonb end);
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
  return jsonb_build_object('day', to_jsonb(res), 'emails',
    case when cur.user_id is null then public.reception_notice(who, p_day, p_day, true) else '[]'::jsonb end);
end $$;

-- Body otherwise unchanged from 20261110120700_types_ranges.sql.
create or replace function public.set_absence_range(p_user uuid, a date, b date, p_type text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.absence_types;
  n int;
  first_day date;
  last_day date;
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
    returning day)
  select count(*), min(day), max(day) into n, first_day, last_day from ins;
  return jsonb_build_object('added', n, 'skipped', skipped, 'emails',
    case when n > 0 then public.reception_notice(
      (select full_name from public.profiles where id = p_user), first_day, last_day, true)
    else '[]'::jsonb end);
end $$;

drop function public.clear_absence_range(uuid, date, date, text);

-- Body otherwise unchanged from 20261110120700_types_ranges.sql.
create function public.clear_absence_range(p_user uuid, a date, b date, p_type text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n int;
  first_day date;
  last_day date;
begin
  perform public.require_admin();
  with del as (
    delete from public.absence_days
     where user_id = p_user and type = p_type and day between a and b
       and request_id is null and status = 'approved'
    returning day)
  select count(*), min(day), max(day) into n, first_day, last_day from del;
  return jsonb_build_object('removed', n, 'emails',
    case when n > 0 then public.reception_notice(
      (select full_name from public.profiles where id = p_user), first_day, last_day, false)
    else '[]'::jsonb end);
end $$;

revoke execute on function public.set_absence(uuid, date, text, text),
  public.clear_absence_range(uuid, date, date, text) from public, anon;
grant execute on function public.set_absence(uuid, date, text, text),
  public.clear_absence_range(uuid, date, date, text) to authenticated;
