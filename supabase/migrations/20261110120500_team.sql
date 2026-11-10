-- T6 Conflicts, staffing load, team calendar (R10, R11).

-- Absent people per team and working day (any status). Admin only.
create function public.team_day_load(a date, b date)
returns table (team_id text, day date, absent_count int, max_absent int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select t.id, d::date, count(distinct ad.user_id)::int, t.max_absent::int
      from public.teams t
     cross join generate_series(a, b, interval '1 day') d
      left join public.profiles p on p.team_id = t.id and p.active
      left join public.absence_days ad on ad.user_id = p.id and ad.day = d::date
     where extract(isodow from d) <= 5 and not public.is_holiday(d::date)
     group by t.id, d, t.max_absent
     order by t.id, d;
end $$;

-- For each pending request: colleagues in the same team who are absent in its range.
create function public.request_conflicts()
returns table (request_id uuid, user_id uuid, full_name text, type text, status text, days date[])
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select r.id, o.id, o.full_name, ad.type, ad.status, array_agg(ad.day order by ad.day)
      from public.leave_requests r
      join public.profiles me on me.id = r.user_id
      join public.profiles o on o.team_id = me.team_id and o.id <> me.id and o.active
      join public.absence_days ad on ad.user_id = o.id and ad.day between r.start_date and r.end_date
     where r.status = 'pending'
     group by r.id, o.id, o.full_name, ad.type, ad.status
     order by r.id, o.full_name;
end $$;

-- Days of a pending request on which its team would exceed the staffing limit.
create function public.request_over_limit()
returns table (request_id uuid, day date, absent_count int, max_absent int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return query
    select r.id, ad.day, count(distinct x.user_id)::int, t.max_absent::int
      from public.leave_requests r
      join public.profiles me on me.id = r.user_id
      join public.teams t on t.id = me.team_id
      join public.absence_days ad on ad.request_id = r.id
      join public.absence_days x on x.day = ad.day
      join public.profiles o on o.id = x.user_id and o.team_id = me.team_id and o.active
     where r.status = 'pending'
     group by r.id, ad.day, t.max_absent
    having count(distinct x.user_id) > t.max_absent
     order by r.id, ad.day;
end $$;

-- Colleagues in the caller's own team, for the team calendar. Off when the switch is off.
create function public.team_members()
returns table (user_id uuid, full_name text, workdays smallint[])
language sql stable security definer set search_path = public as $$
  select o.id, o.full_name, o.workdays
    from public.profiles me
    join public.profiles o on o.team_id = me.team_id and o.id <> me.id and o.active
   where me.id = auth.uid() and me.active
     and (select team_calendar from public.app_settings)
   order by o.sort, o.full_name;
$$;

-- Who is absent, never why (R11): no type column, health data stays hidden.
create function public.team_calendar(a date, b date)
returns table (user_id uuid, full_name text, day date, status text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.full_name, ad.day, ad.status
    from public.team_members() m
    join public.absence_days ad on ad.user_id = m.user_id and ad.day between a and b
   order by m.full_name, ad.day;
$$;

revoke execute on function public.team_day_load(date, date), public.request_conflicts(),
  public.request_over_limit(), public.team_members(), public.team_calendar(date, date) from public, anon;
grant execute on function public.team_day_load(date, date), public.request_conflicts(),
  public.request_over_limit(), public.team_members(), public.team_calendar(date, date) to authenticated;
