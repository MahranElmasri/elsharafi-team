-- T17g Reception emails (R18, v1.15): addresses on Einstellungen (e.g. the reception) are told
-- who is not in the practice: at once for a sick report, and when an admin approves or cancels
-- an approved leave. Name and dates only: no reason, no note, no link (health data stays out).

create table public.notify_recipients (
  email text primary key
    check (char_length(email) <= 254 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);

-- Admins only: app_settings is readable by every signed-in user, so the list lives here.
alter table public.notify_recipients enable row level security;
create policy recipients_admin_read on public.notify_recipients for select to authenticated
  using (public.is_admin());
create policy recipients_admin_insert on public.notify_recipients for insert to authenticated
  with check (public.is_admin());
create policy recipients_admin_delete on public.notify_recipients for delete to authenticated
  using (public.is_admin());

create trigger audit_recipients after insert or delete on public.notify_recipients
  for each row execute function public.audit_row('email');

-- One email per address (no in-app notice, no link). p_on: away; otherwise: cancelled.
create function public.reception_notice(p_who text, p_from date, p_to date, p_on boolean)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  span text := case when p_from = p_to then 'am ' || to_char(p_from, 'FMDD.FMMM.YYYY')
                    else 'vom ' || to_char(p_from, 'FMDD.FMMM.') || ' bis ' || to_char(p_to, 'FMDD.FMMM.YYYY') end;
  subject text := format(case when p_on then 'Nicht in der Praxis: %s, %s' else 'Doch in der Praxis: %s, %s' end,
                         p_who, public.fmt_range(p_from, p_to));
  body text := format(case when p_on then '%s ist %s nicht in der Praxis.'
                           else '%s ist %s doch in der Praxis. Die Abwesenheit wurde storniert.' end, p_who, span);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('to', r.email, 'subject', subject, 'text', body,
                                                       'link', null) order by r.email), '[]')
            from public.notify_recipients r);
end $$;

revoke execute on function public.reception_notice(text, date, date, boolean) from public, anon, authenticated;

-- Bodies otherwise unchanged from 20261117120000_substitute_notify.sql.

create or replace function public.report_absence(
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
  emails := emails || public.reception_notice(me.full_name, p_from, p_to, true);
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
  if p_approve then
    emails := emails || public.reception_notice(who.full_name, r.start_date, r.end_date, true);
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
    if r.status = 'approved' then
      emails := emails || public.reception_notice(who.full_name, r.start_date, r.end_date, false);
    end if;
    return jsonb_build_object('emails', emails);
  end if;

  raise exception 'Dieser Antrag kann nicht mehr zurückgezogen werden.' using errcode = '42501';
end $$;
