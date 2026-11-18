-- T15d (R7, R8, R18): the substitute is told when a leave is approved (no longer when it is
-- requested), when an approved leave is cancelled, and at once when named in a sick report.
-- Substitute messages carry the name and dates only, never the type or note.

-- Name and dates only; does nothing when the "Vertretung" switch is off.
create function public.substitute_notice(p_sub uuid, p_who text, p_from date, p_to date, p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  span text := public.fmt_range(p_from, p_to);
begin
  if not (select substitutes from public.app_settings) then return '[]'; end if;
  if p_on then
    return public.notify(array[p_sub],
      format('Sie vertreten %s: %s', p_who, span),
      format('%s ist vom %s abwesend. Sie sind als Vertretung eingetragen.', p_who, span), '/me');
  end if;
  return public.notify(array[p_sub],
    format('Vertretung entfällt: %s, %s', p_who, span),
    format('Die Abwesenheit von %s (%s) wurde storniert. Die Vertretung entfällt.', p_who, span), '/me');
end $$;

create or replace function public.request_leave(
  p_type text, p_from date, p_to date,
  p_start_half text default null, p_end_half text default null,
  p_substitute uuid default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  t public.absence_types;
  s public.app_settings;
  days date[];
  total numeric;
  bal record;
  clash date;
  req_id uuid;
  emails jsonb := '[]';
  span text;
begin
  select * into me from public.profiles where id = auth.uid() and active;
  if not found then raise exception 'Ihr Konto ist deaktiviert.' using errcode = '42501'; end if;
  select * into s from public.app_settings;
  select * into t from public.absence_types where code = p_type;
  if not found or not t.visible or t.entry_mode <> 'request' then
    raise exception 'Diese Abwesenheitsart kann nicht beantragt werden.';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Das Ende liegt vor dem Anfang.';
  end if;
  if extract(year from p_from) <> extract(year from p_to) then
    raise exception 'Bitte teilen Sie den Antrag am Jahreswechsel in zwei Anträge.';
  end if;
  if (p_start_half is not null or p_end_half is not null) and not s.half_days then
    raise exception 'Halbe Tage sind in den Einstellungen ausgeschaltet.';
  end if;
  if p_from = p_to and p_start_half is not null and p_end_half is not null then
    raise exception 'Wählen Sie für einen einzelnen Tag nur vormittags oder nachmittags.';
  end if;
  if not s.substitutes then
    p_substitute := null;
  elsif p_substitute is not null and not exists (
      select 1 from public.profiles where id = p_substitute and active and team_id = me.team_id and id <> me.id) then
    raise exception 'Die Vertretung muss aus Ihrer Gruppe sein.';
  end if;

  select array_agg(d) into days from public.person_workdays(me.id, p_from, p_to) d;
  if days is null then
    raise exception 'An diesen Tagen arbeiten Sie nicht. Wählen Sie andere Tage.';
  end if;
  select min(day) into clash from public.absence_days where user_id = me.id and day = any (days);
  if clash is not null then
    raise exception 'Am % gibt es schon einen Eintrag. Wählen Sie andere Tage.', to_char(clash, 'FMDD.FMMM.YYYY');
  end if;

  total := cardinality(days)
         - case when p_start_half is not null and days[1] = p_from then 0.5 else 0 end
         - case when p_end_half is not null and days[cardinality(days)] = p_to
                     and not (p_from = p_to and p_start_half is not null) then 0.5 else 0 end;

  if t.deducts_vacation then
    select * into bal from public.balance_of(me.id, extract(year from p_from)::int);
    if bal.available < total then
      raise exception 'Dafür reichen Ihre Urlaubstage nicht: % verfügbar, % beantragt.',
        replace(trim_scale(bal.available)::text, '.', ','), replace(trim_scale(total)::text, '.', ',');
    end if;
  end if;

  insert into public.leave_requests (user_id, type, start_date, end_date, start_half, end_half, substitute_id, note)
  values (me.id, p_type, p_from, p_to, p_start_half, p_end_half, p_substitute, nullif(btrim(p_note), ''))
  returning id into req_id;

  begin
    insert into public.absence_days (user_id, day, type, amount, half, status, request_id)
    select me.id, d, p_type,
           case when (d = p_from and p_start_half is not null) or (d = p_to and p_end_half is not null) then 0.5 else 1 end,
           case when d = p_from and p_start_half is not null then 'pm'
                when d = p_to and p_end_half is not null then 'am' end,
           'pending', req_id
      from unnest(days) d;
  exception when unique_violation then
    raise exception 'Für diese Tage wurde gerade schon etwas eingetragen. Bitte laden Sie neu.';
  end;

  span := public.fmt_range(p_from, p_to);
  emails := public.notify(public.admin_ids(),
    format('%s hat %s beantragt: %s', me.full_name, t.label, span),
    format('%s hat %s für %s beantragt (%s).%s', me.full_name, t.label, span, public.fmt_days(total),
           coalesce(E'\nNotiz: ' || nullif(btrim(p_note), ''), '')),
    '/admin');

  return jsonb_build_object('request_id', req_id, 'days', total, 'emails', emails);
end $$;

drop function public.report_absence(text, date, date, text);
create function public.report_absence(
  p_type text, p_from date, p_to date, p_note text default null, p_substitute uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  t public.absence_types;
  s public.app_settings;
  added date[];
  skipped date[];
  emails jsonb;
begin
  select * into me from public.profiles where id = auth.uid() and active;
  if not found then raise exception 'Ihr Konto ist deaktiviert.' using errcode = '42501'; end if;
  select * into t from public.absence_types where code = p_type;
  if not found or not t.visible or t.entry_mode <> 'report' then
    raise exception 'Diese Abwesenheitsart kann nicht direkt gemeldet werden.';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Prüfen Sie die Daten: das Ende liegt vor dem Anfang.';
  end if;
  select * into s from public.app_settings;
  if not s.substitutes then
    p_substitute := null;
  elsif p_substitute is not null and not exists (
      select 1 from public.profiles where id = p_substitute and active and team_id = me.team_id and id <> me.id) then
    raise exception 'Die Vertretung muss aus Ihrer Gruppe sein.';
  end if;

  select array_agg(d) filter (where a.day is null), array_agg(d) filter (where a.day is not null)
    into added, skipped
    from public.person_workdays(me.id, p_from, p_to) d
    left join public.absence_days a on a.user_id = me.id and a.day = d;
  if added is null then
    raise exception 'An diesen Tagen arbeiten Sie nicht oder es gibt schon Einträge.';
  end if;

  insert into public.absence_days (user_id, day, type, status)
  select me.id, d, p_type, 'approved' from unnest(added) d;

  emails := public.notify(public.admin_ids(),
    format('%s: %s, %s', me.full_name, t.label, public.fmt_range(p_from, p_to)),
    format('%s hat „%s“ gemeldet: %s.%s', me.full_name, t.label, public.fmt_range(p_from, p_to),
           coalesce(E'\nNotiz: ' || nullif(btrim(p_note), ''), '')),
    '/admin');
  if p_substitute is not null then
    -- Health data: the substitute learns name and dates only, never the type.
    emails := emails || public.substitute_notice(p_substitute, me.full_name, p_from, p_to, true);
  end if;
  return jsonb_build_object('days', cardinality(added), 'skipped', coalesce(to_jsonb(skipped), '[]'), 'emails', emails);
end $$;

create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.leave_requests;
  t public.absence_types;
  who public.profiles;
  amt numeric;
  bal record;
  emails jsonb;
  word text := case when p_approve then 'genehmigt' else 'abgelehnt' end;
begin
  perform public.require_admin();
  select * into r from public.leave_requests where id = p_id for update;
  if not found then raise exception 'Antrag nicht gefunden.'; end if;
  if r.status <> 'pending' then raise exception 'Über diesen Antrag wurde schon entschieden.'; end if;
  select * into t from public.absence_types where code = r.type;
  select * into who from public.profiles where id = r.user_id;

  if p_approve then
    if t.deducts_vacation then
      select coalesce(sum(amount), 0) into amt from public.absence_days where request_id = r.id;
      select * into bal from public.balance_of(r.user_id, extract(year from r.start_date)::int);
      if bal.remaining < amt then
        raise exception 'Nicht genug Urlaub: % übrig, der Antrag braucht %.',
          replace(trim_scale(bal.remaining)::text, '.', ','), replace(trim_scale(amt)::text, '.', ',');
      end if;
    end if;
    update public.absence_days set status = 'approved' where request_id = r.id;
  else
    delete from public.absence_days where request_id = r.id;
  end if;

  update public.leave_requests
     set status = case when p_approve then 'approved' else 'denied' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where id = r.id;

  emails := public.notify(array[r.user_id],
    format('Ihr Antrag %s %s wurde %s.', t.label, public.fmt_range(r.start_date, r.end_date), word),
    format('Ihr Antrag „%s“ für %s wurde %s.%s', t.label, public.fmt_range(r.start_date, r.end_date), word,
           coalesce(E'\nNachricht der Praxisleitung: ' || nullif(btrim(p_note), ''), '')),
    '/me');
  if p_approve and r.substitute_id is not null then
    emails := emails || public.substitute_notice(r.substitute_id, who.full_name, r.start_date, r.end_date, true);
  end if;
  return jsonb_build_object('emails', emails);
end $$;

create or replace function public.cancel_leave(p_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.leave_requests;
  t public.absence_types;
  who public.profiles;
  span text;
  emails jsonb;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found then raise exception 'Antrag nicht gefunden.'; end if;
  select * into t from public.absence_types where code = r.type;
  select * into who from public.profiles where id = r.user_id;
  span := public.fmt_range(r.start_date, r.end_date);

  if r.user_id = auth.uid() and r.status = 'pending' then
    delete from public.absence_days where request_id = r.id;
    update public.leave_requests set status = 'cancelled', decided_at = now() where id = r.id;
    return jsonb_build_object('emails', public.notify(public.admin_ids(),
      format('%s hat den Antrag %s zurückgezogen: %s', who.full_name, t.label, span),
      format('%s hat den Antrag „%s“ für %s zurückgezogen.', who.full_name, t.label, span), '/admin'));
  end if;

  if public.is_admin() and r.status in ('pending', 'approved') then
    delete from public.absence_days where request_id = r.id;
    update public.leave_requests
       set status = 'cancelled', decided_by = auth.uid(), decided_at = now(),
           decision_note = nullif(btrim(p_note), '')
     where id = r.id;
    emails := public.notify(array[r.user_id],
      format('Ihr Antrag %s %s wurde storniert.', t.label, span),
      format('Die Praxisleitung hat Ihren Antrag „%s“ für %s storniert.%s', t.label, span,
             coalesce(E'\nNachricht: ' || nullif(btrim(p_note), ''), '')), '/me');
    if r.status = 'approved' and r.substitute_id is not null then
      emails := emails || public.substitute_notice(r.substitute_id, who.full_name, r.start_date, r.end_date, false);
    end if;
    return jsonb_build_object('emails', emails);
  end if;

  raise exception 'Dieser Antrag kann nicht mehr zurückgezogen werden.' using errcode = '42501';
end $$;

revoke execute on function public.substitute_notice(uuid, text, date, date, boolean) from public, anon, authenticated;
revoke execute on function public.report_absence(text, date, date, text, uuid) from public, anon;
grant execute on function public.report_absence(text, date, date, text, uuid) to authenticated;
