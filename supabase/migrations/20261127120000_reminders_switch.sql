-- T17l (R15, R24, v1.22): a practice-wide switch for the vacation reminders. Off by default,
-- also on the existing row, until the leave already taken this year is in the app.

alter table public.app_settings add column reminders boolean not null default false;
update public.app_settings set reminders = false;

-- Same as 20261111120000, plus: nobody is due while the switch is off.
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
       and (select reminders from public.app_settings)
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
