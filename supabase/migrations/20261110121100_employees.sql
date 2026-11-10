-- T10 Employee management (R19, R13). The server action creates the Auth account and keeps
-- its email and role in step; every rule about the person lives here.

-- German message when a username or email is taken or malformed; null when all is fine.
create function public.employee_conflict(p_user uuid, p_username text, p_email text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  u text := lower(btrim(p_username));
  e text := lower(nullif(btrim(p_email), ''));
begin
  perform public.require_admin();
  if u !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    return 'Der Benutzername braucht 3–32 Zeichen: Kleinbuchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.';
  end if;
  if exists (select 1 from public.profiles where username = u and id is distinct from p_user) then
    return format('Den Benutzernamen „%s“ gibt es schon. Wählen Sie einen anderen.', u);
  end if;
  if e is not null and e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return 'Die E-Mail-Adresse ist ungültig. Prüfen Sie die Schreibweise.';
  end if;
  if e is not null and exists (select 1 from auth.users where lower(email) = e and id is distinct from p_user) then
    return format('Die E-Mail-Adresse %s gehört schon zu einem anderen Konto.', e);
  end if;
  return null;
end $$;

create function public.save_employee(
  p_user uuid, p_username text, p_full_name text, p_email text, p_team text, p_role text,
  p_workdays smallint[], p_start date, p_end date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  msg text;
begin
  perform public.require_admin();
  msg := public.employee_conflict(p_user, p_username, p_email);
  if msg is not null then raise exception '%', msg; end if;
  if nullif(btrim(p_full_name), '') is null then raise exception 'Bitte geben Sie den Namen ein.'; end if;
  if p_workdays is null or cardinality(p_workdays) = 0 then
    raise exception 'Wählen Sie mindestens einen Arbeitstag.';
  end if;
  if p_end is not null and p_end < p_start then
    raise exception 'Das Austrittsdatum liegt vor dem Eintrittsdatum.';
  end if;

  -- guard_profile_self stops an admin from removing their own admin role.
  update public.profiles set
    username = lower(btrim(p_username)), full_name = btrim(p_full_name),
    notify_email = lower(nullif(btrim(p_email), '')), team_id = p_team, role = p_role,
    workdays = (select array_agg(distinct d order by d) from unnest(p_workdays) d),
    start_date = p_start, end_date = p_end
  where id = p_user;
  if not found then raise exception 'Diese Person gibt es nicht.'; end if;
end $$;

create function public.set_employee_active(p_user uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_user = auth.uid() and not p_active then
    raise exception 'Sie können sich nicht selbst deaktivieren.';
  end if;
  update public.profiles set active = p_active where id = p_user;
  if not found then raise exception 'Diese Person gibt es nicht.'; end if;
  if not p_active then
    -- Open links of a deactivated account must not work any more.
    update public.invite_tokens set used_at = now() where user_id = p_user and used_at is null;
  end if;
end $$;

-- Only for people without any entries (R19); everyone else is deactivated instead.
create function public.delete_employee(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  perform public.require_admin();
  if p_user = auth.uid() then raise exception 'Sie können sich nicht selbst löschen.'; end if;
  select full_name into who from public.profiles where id = p_user;
  if not found then raise exception 'Diese Person gibt es nicht.'; end if;
  if exists (select 1 from public.absence_days where user_id = p_user)
     or exists (select 1 from public.leave_requests where user_id = p_user) then
    raise exception '% hat schon Einträge und kann nicht gelöscht werden. Deaktivieren Sie das Konto stattdessen.', who;
  end if;
  delete from auth.users where id = p_user;   -- cascades to the profile
end $$;

create function public.set_allowance(p_user uuid, p_year int, p_days numeric, p_carryover numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_days is null or p_days < 0 or p_days > 99 or p_carryover is null or p_carryover < 0 or p_carryover > 99
     or p_days * 2 <> floor(p_days * 2) or p_carryover * 2 <> floor(p_carryover * 2) then
    raise exception 'Urlaubstage und Übertrag: 0 bis 99, ganze oder halbe Tage.';
  end if;
  insert into public.leave_allowances (user_id, year, days, carryover)
  values (p_user, p_year, p_days, p_carryover)
  on conflict (user_id, year) do update set days = excluded.days, carryover = excluded.carryover;
end $$;

create function public.set_team_limit(p_team text, p_max int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if p_max is null or p_max < 0 or p_max > 50 then
    raise exception 'Die Grenze muss zwischen 0 und 50 liegen.';
  end if;
  update public.teams set max_absent = p_max where id = p_team;
  if not found then raise exception 'Diese Gruppe gibt es nicht.'; end if;
end $$;

revoke execute on function public.employee_conflict(uuid, text, text),
  public.save_employee(uuid, text, text, text, text, text, smallint[], date, date),
  public.set_employee_active(uuid, boolean), public.delete_employee(uuid),
  public.set_allowance(uuid, int, numeric, numeric), public.set_team_limit(text, int) from public, anon;
grant execute on function public.employee_conflict(uuid, text, text),
  public.save_employee(uuid, text, text, text, text, text, smallint[], date, date),
  public.set_employee_active(uuid, boolean), public.delete_employee(uuid),
  public.set_allowance(uuid, int, numeric, numeric), public.set_team_limit(text, int) to authenticated;
