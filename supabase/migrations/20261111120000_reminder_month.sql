-- T16 fix (R15): "once per kind and month" compared the real send time with the month of
-- as_of, so a run for another month (catch-up, tests) reminded people again. The log now
-- records the month the notice is for, and the check uses that.

alter table public.reminder_log add column for_month date;
update public.reminder_log
   set for_month = date_trunc('month', sent_at at time zone 'Europe/Berlin')::date;
alter table public.reminder_log
  alter column for_month set not null,
  alter column for_month set default (date_trunc('month', now() at time zone 'Europe/Berlin'))::date;

create or replace function public.due_reminders(p_as_of date default current_date)
returns table (user_id uuid, full_name text, notify_email text, kind text, year int, days_at_risk numeric)
language sql stable security definer set search_path = public as $$
  with y as (select extract(year from p_as_of)::int as y),
  cand as (
    select p.id, p.full_name, p.notify_email, k.kind, y.y,
           case k.kind when 'year_end' then b.available
                       else b.carryover - b.carryover_used end as at_risk
      from public.profiles p cross join y
      cross join (values ('year_end'), ('carryover')) k(kind)
      cross join lateral public.balance_of(p.id, y.y, p_as_of) b
     where p.active
       and ((k.kind = 'year_end' and p_as_of >= make_date(y.y, 10, 1))
         or (k.kind = 'carryover' and p_as_of between make_date(y.y, 2, 1) and make_date(y.y, 3, 31)))
  )
  select c.id, c.full_name, c.notify_email, c.kind, c.y, c.at_risk
    from cand c
   where c.at_risk > 0
     and not exists (select 1 from public.reminder_log l
                      where l.user_id = c.id and l.kind = c.kind and l.year = c.y
                        and l.for_month = date_trunc('month', p_as_of)::date)
   order by c.full_name, c.kind;
$$;

create or replace function public.run_reminders(p_as_of date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  subj text;
  body text;
  emails jsonb := '[]';
begin
  for r in select * from public.due_reminders(p_as_of) loop
    if r.kind = 'year_end' then
      subj := format('Sie haben noch %s Urlaub für %s', public.fmt_days(r.days_at_risk), r.year);
      body := format('Sie haben noch %s Urlaub für %s. Bitte beantragen Sie ihn rechtzeitig. '
                     'Urlaub, der bis zum 31.12.%s nicht genommen wird, verfällt bis auf den gesetzlichen Übertrag.',
                     public.fmt_days(r.days_at_risk), r.year, r.year);
    else
      subj := format('Resturlaub aus %s verfällt am 31.3.%s', r.year - 1, r.year);
      body := format('Sie haben noch %s Resturlaub aus %s. Er verfällt am 31.3.%s, wenn Sie ihn bis dahin nicht nehmen.',
                     public.fmt_days(r.days_at_risk), r.year - 1, r.year);
    end if;
    insert into public.notifications (user_id, message, link) values (r.user_id, subj, '/me');
    insert into public.reminder_log (user_id, kind, year, days_at_risk, channel, for_month)
    values (r.user_id, r.kind, r.year, r.days_at_risk, 'in_app', date_trunc('month', p_as_of)::date);
    if r.notify_email is not null then
      emails := emails || jsonb_build_object('user_id', r.user_id, 'kind', r.kind, 'year', r.year,
        'days_at_risk', r.days_at_risk, 'to', r.notify_email, 'subject', subj, 'text', body, 'link', '/me');
    end if;
  end loop;
  return emails;
end $$;

-- New optional parameter: the email is logged for the same month as its in-app reminder.
drop function public.log_reminder_email(uuid, text, int, numeric);
create function public.log_reminder_email(p_user uuid, p_kind text, p_year int, p_days numeric,
                                          p_as_of date default current_date)
returns void
language sql security definer set search_path = public as $$
  insert into public.reminder_log (user_id, kind, year, days_at_risk, channel, for_month)
  values (p_user, p_kind, p_year, p_days, 'email', date_trunc('month', p_as_of)::date);
$$;

revoke execute on function public.log_reminder_email(uuid, text, int, numeric, date)
  from public, anon, authenticated;
grant execute on function public.log_reminder_email(uuid, text, int, numeric, date) to service_role;
