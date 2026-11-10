-- T2 Calendar: Berlin public holidays and each person's working days (R5, R6).

-- Easter Sunday, anonymous Gregorian algorithm (Meeus/Jones/Butcher).
create function public.easter_sunday(y int) returns date
language plpgsql immutable set search_path = public as $$
declare
  a int := y % 19; b int := y / 100; c int := y % 100;
  d int := b / 4; e int := b % 4; f int := (b + 8) / 25; g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30; i int := c / 4; k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7; m int := (a + 11 * h + 22 * l) / 451;
  n int := h + l - 7 * m + 114;
begin
  return make_date(y, n / 31, n % 31 + 1);
end $$;

create function public.berlin_holidays(y int) returns table (day date, name text)
language sql immutable set search_path = public as $$
  with e as (select public.easter_sunday(y) as es)
  select v.day, v.name from e, lateral (values
    (make_date(y, 1, 1),   'Neujahr'),
    (make_date(y, 3, 8),   'Internationaler Frauentag'),
    (es - 2,               'Karfreitag'),
    (es + 1,               'Ostermontag'),
    (make_date(y, 5, 1),   'Tag der Arbeit'),
    (make_date(y, 5, 8),   'Tag der Befreiung'),
    (es + 39,              'Christi Himmelfahrt'),
    (es + 50,              'Pfingstmontag'),
    (make_date(y, 10, 3),  'Tag der Deutschen Einheit'),
    (make_date(y, 12, 25), '1. Weihnachtstag'),
    (make_date(y, 12, 26), '2. Weihnachtstag')
  ) as v (day, name)
  where (v.name <> 'Internationaler Frauentag' or y >= 2019)   -- Berlin holiday since 2019
    and (v.name <> 'Tag der Befreiung' or y in (2020, 2025))    -- one-off holidays only
  order by v.day;
$$;

create function public.is_holiday(d date) returns boolean
language sql immutable set search_path = public as $$
  select exists (select 1 from public.berlin_holidays(extract(year from d)::int) h where h.day = d);
$$;

-- Dates in [a, b] that are this person's working weekdays, not holidays,
-- and inside their employment period. Security invoker: RLS on profiles applies.
create function public.person_workdays(p_user uuid, a date, b date) returns setof date
language sql stable set search_path = public as $$
  select d::date
  from public.profiles p, generate_series(a, b, interval '1 day') d
  where p.id = p_user
    and extract(isodow from d)::smallint = any (p.workdays)
    and d::date >= p.start_date
    and (p.end_date is null or d::date <= p.end_date)
    and not public.is_holiday(d::date)
  order by 1;
$$;

revoke execute on function public.easter_sunday(int), public.berlin_holidays(int),
  public.is_holiday(date), public.person_workdays(uuid, date, date) from public, anon;
grant execute on function public.berlin_holidays(int), public.is_holiday(date),
  public.person_workdays(uuid, date, date) to authenticated;
