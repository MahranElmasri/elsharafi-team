-- T8 Reminders (BAG employer notice), health-data retention, scheduled jobs (R15, R20).

-- R3 lists "Kind krank" as health data; the T1 seed missed it.
update public.absence_types set is_health = true where code = 'child_sick';

-- ---------------------------------------------------------------- balances for the reminder job
-- Same as T4, plus the service role (the reminders endpoint) may read any balance.
create or replace function public.balance_of(p_user uuid, p_year int, p_as_of date default current_date)
returns table (
  allowance numeric, carryover numeric, carryover_used numeric, carryover_expired numeric,
  vacation_taken numeric, vacation_pending numeric, remaining numeric, available numeric,
  sick_days numeric, by_type jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare
  a numeric := 0; c numeric := 0;
  taken numeric; pend numeric; early numeric; used numeric; expired numeric;
begin
  if not (p_user = auth.uid() or public.is_admin() or auth.role() = 'service_role') then
    raise exception 'Das darf nur die Praxisleitung.' using errcode = '42501';
  end if;
  select la.days, la.carryover into a, c from public.leave_allowances la
   where la.user_id = p_user and la.year = p_year;
  a := coalesce(a, 0); c := coalesce(c, 0);

  select coalesce(sum(d.amount) filter (where d.status = 'approved'), 0),
         coalesce(sum(d.amount) filter (where d.status = 'pending'), 0),
         coalesce(sum(d.amount) filter (where d.status = 'approved' and d.day <= make_date(p_year, 3, 31)), 0)
    into taken, pend, early
    from public.absence_days d join public.absence_types t on t.code = d.type
   where d.user_id = p_user and t.deducts_vacation
     and d.day between make_date(p_year, 1, 1) and make_date(p_year, 12, 31);

  used := least(c, early);
  expired := case when p_as_of > make_date(p_year, 3, 31) then c - used else 0 end;

  return query select
    a, c, used, expired, taken, pend,
    a + c - expired - taken,
    a + c - expired - taken - pend,
    (select coalesce(sum(d.amount), 0) from public.absence_days d
      where d.user_id = p_user and d.status = 'approved' and d.type in ('sick', 'child_sick')
        and d.day between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)),
    (select coalesce(jsonb_object_agg(x.type, x.total), '{}') from (
       select d.type, sum(d.amount) as total from public.absence_days d
        where d.user_id = p_user and d.status = 'approved'
          and d.day between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
        group by d.type) x);
end $$;

-- ---------------------------------------------------------------- reminder log
create table public.reminder_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('year_end', 'carryover')),
  year int not null,
  days_at_risk numeric(4, 1) not null,
  channel text not null check (channel in ('in_app', 'email')),
  sent_at timestamptz not null default now()
);
create index reminder_log_user on public.reminder_log (user_id, kind, year, sent_at desc);
alter table public.reminder_log enable row level security;
create policy reminder_log_read on public.reminder_log for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Who is due a reminder on p_as_of (at most one per kind and calendar month):
--   year_end  from 1.10.: vacation still available this year
--   carryover 1.2.–31.3.: carry-over from last year not yet used, expires on 31.3.
create function public.due_reminders(p_as_of date default current_date)
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
                        and date_trunc('month', l.sent_at at time zone 'Europe/Berlin') = date_trunc('month', p_as_of))
   order by c.full_name, c.kind;
$$;

-- Creates the in-app reminders, logs them, and returns the emails to send.
-- The endpoint logs each email with log_reminder_email after it went out.
create function public.run_reminders(p_as_of date default current_date)
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
    insert into public.reminder_log (user_id, kind, year, days_at_risk, channel)
    values (r.user_id, r.kind, r.year, r.days_at_risk, 'in_app');
    if r.notify_email is not null then
      emails := emails || jsonb_build_object('user_id', r.user_id, 'kind', r.kind, 'year', r.year,
        'days_at_risk', r.days_at_risk, 'to', r.notify_email, 'subject', subj, 'text', body, 'link', '/me');
    end if;
  end loop;
  return emails;
end $$;

create function public.log_reminder_email(p_user uuid, p_kind text, p_year int, p_days numeric)
returns void
language sql security definer set search_path = public as $$
  insert into public.reminder_log (user_id, kind, year, days_at_risk, channel)
  values (p_user, p_kind, p_year, p_days, 'email');
$$;

revoke execute on function public.due_reminders(date), public.run_reminders(date),
  public.log_reminder_email(uuid, text, int, numeric) from public, anon, authenticated;
grant execute on function public.due_reminders(date), public.run_reminders(date),
  public.log_reminder_email(uuid, text, int, numeric) to service_role;

-- ---------------------------------------------------------------- retention (R20)
-- Deletes health-data days (and their notes and audit rows) before 1.1. three years ago:
-- in 2026 everything up to 31.12.2022 goes. Leaves one summary row in the audit log.
create function public.purge_health_data(p_today date default current_date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  cutoff date := make_date(extract(year from p_today)::int - 3, 1, 1);
  n int;
begin
  create temp table purged on commit drop as
    select d.user_id, d.day from public.absence_days d
      join public.absence_types t on t.code = d.type
     where t.is_health and d.day < cutoff;

  delete from public.absence_days d using purged p where d.user_id = p.user_id and d.day = p.day;
  get diagnostics n = row_count;
  delete from public.day_notes d using purged p where d.user_id = p.user_id and d.day = p.day;
  delete from public.audit_log a using purged p
   where a.table_name = 'absence_days' and a.row_key = p.user_id::text || '|' || p.day::text;
  drop table purged;

  insert into public.audit_log (actor, table_name, row_key, action, old)
  values (null, 'absence_days', 'retention', 'DELETE',
          jsonb_build_object('deleted_days', n, 'before', cutoff));
  return n;
end $$;

revoke execute on function public.purge_health_data(date) from public, anon, authenticated;

-- ---------------------------------------------------------------- scheduled jobs
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Calls the app's reminder endpoint. URL and secret come from Vault (set at release):
--   select vault.create_secret('https://…', 'app_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- Does nothing until both exist.
create function public.call_reminders_endpoint() returns bigint
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
    url := rtrim(url, '/') || '/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb);
end $$;

revoke execute on function public.call_reminders_endpoint() from public, anon, authenticated;

-- Times are UTC: 03:00 and 06:00 UTC are 04:00/05:00 and 07:00/08:00 in Berlin.
select cron.schedule('purge-health-data', '0 3 1 * *', 'select public.purge_health_data()');
select cron.schedule('daily-reminders', '0 6 * * *', 'select public.call_reminders_endpoint()');
