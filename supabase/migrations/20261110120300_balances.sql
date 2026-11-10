-- T4 Allowances, pro-rata suggestion, balances with carry-over expiry (R12, R13, R14).

create table public.leave_allowances (
  user_id uuid not null references public.profiles (id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  days numeric(4, 1) not null check (days >= 0),
  carryover numeric(4, 1) not null default 0 check (carryover >= 0),
  primary key (user_id, year)
);

alter table public.leave_allowances enable row level security;
create policy allowance_read on public.leave_allowances for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy allowance_admin_insert on public.leave_allowances for insert to authenticated
  with check (public.is_admin());
create policy allowance_admin_update on public.leave_allowances for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy allowance_admin_delete on public.leave_allowances for delete to authenticated
  using (public.is_admin());

create trigger audit_allowances after insert or update or delete on public.leave_allowances
  for each row execute function public.audit_row('user_id', 'year');

-- §5 BUrlG: scale the full-time allowance by working days per week (÷ 5) and, for a
-- partial year, by full months employed (÷ 12). A fraction of at least half a day
-- rounds up to a whole day; smaller fractions are kept.
create function public.suggested_allowance(p_user uuid, p_year int, p_fulltime_days numeric)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  months int := 0;
  m int;
  x numeric;
begin
  if not (p_user = auth.uid() or public.is_admin()) then
    raise exception 'Das darf nur die Praxisleitung.' using errcode = '42501';
  end if;
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'Unbekannte Person.'; end if;

  for m in 1..12 loop
    if p.start_date <= make_date(p_year, m, 1)
       and (p.end_date is null or p.end_date >= (make_date(p_year, m, 1) + interval '1 month - 1 day')::date) then
      months := months + 1;
    end if;
  end loop;

  x := p_fulltime_days * cardinality(p.workdays) / 5.0 * months / 12.0;
  if x - floor(x) >= 0.5 then
    return ceil(x);
  end if;
  return round(x, 1);
end $$;

-- One person's balance. Callable for yourself, or by an admin for anyone.
create function public.balance_of(p_user uuid, p_year int, p_as_of date default current_date)
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
  if not (p_user = auth.uid() or public.is_admin()) then
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

-- Everyone the caller may see (RLS on profiles): employees get their own row, admins all.
create function public.balances(p_year int, p_as_of date default current_date)
returns table (
  user_id uuid, full_name text, team_id text, allowance numeric, carryover numeric,
  carryover_used numeric, carryover_expired numeric, vacation_taken numeric,
  vacation_pending numeric, remaining numeric, available numeric, sick_days numeric, by_type jsonb
)
language sql stable set search_path = public as $$
  select p.id, p.full_name, p.team_id, b.*
  from public.profiles p, lateral public.balance_of(p.id, p_year, p_as_of) b
  order by p.team_id, p.sort, p.full_name;
$$;

revoke execute on function public.suggested_allowance(uuid, int, numeric),
  public.balance_of(uuid, int, date), public.balances(int, date) from public, anon;
grant execute on function public.suggested_allowance(uuid, int, numeric),
  public.balance_of(uuid, int, date), public.balances(int, date) to authenticated;
