-- Expand the bundled profile avatar range while keeping existing profile choices stable.
alter table public.profiles alter column avatar_preset
  set default (pg_catalog.floor(pg_catalog.random() * 197)::int + 1);
alter table public.profiles drop constraint profiles_avatar_preset_range;
alter table public.profiles add constraint profiles_avatar_preset_range check (avatar_preset between 1 and 197);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := new.raw_user_meta_data;
  v_tz text;
  v_birth date;
  v_today date;
  v_age int;
  v_preset smallint;
begin
  -- users created without signup metadata (tests, dashboard) get no profile
  if m is null or not (m ? 'username') then
    return new;
  end if;

  if coalesce(m ->> 'terms_accepted', '') <> 'true' then
    raise exception 'terms_required' using errcode = 'P0001';
  end if;

  v_tz := m ->> 'timezone';
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = v_tz) then
    raise exception 'invalid_timezone' using errcode = 'P0001';
  end if;

  begin
    v_birth := (m ->> 'birth_date')::date;
  exception when others then
    raise exception 'invalid_birth_date' using errcode = 'P0001';
  end;
  -- also rejects infinity and anything before 1900
  if v_birth is null or v_birth not between date '1900-01-01' and date '9999-12-31' then
    raise exception 'invalid_birth_date' using errcode = 'P0001';
  end if;

  -- same rule as isAdult(): year difference, minus one until MMDD is reached
  v_today := (pg_catalog.now() at time zone v_tz)::date;
  v_age := extract(year from v_today)::int - extract(year from v_birth)::int
    - case when pg_catalog.to_char(v_today, 'MMDD') < pg_catalog.to_char(v_birth, 'MMDD') then 1 else 0 end;
  if v_age < 18 then
    raise exception 'underage' using errcode = 'P0001';
  end if;

  -- a JSON number written as a plain integer 1..197 (no string, fraction or exponent)
  if pg_catalog.jsonb_typeof(m -> 'avatar_preset') = 'number' and (m ->> 'avatar_preset') ~ '^[1-9][0-9]{0,2}$' then
    if (m ->> 'avatar_preset')::int between 1 and 197 then
      v_preset := (m ->> 'avatar_preset')::smallint;
    end if;
  end if;

  -- username format and uniqueness are enforced by the table constraints
  insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, avatar_preset)
  values (
    new.id,
    m ->> 'username',
    pg_catalog.btrim(m ->> 'first_name'),
    pg_catalog.btrim(m ->> 'last_name'),
    v_birth,
    pg_catalog.now(),
    v_tz,
    -- fallback repeats the column default (random 1..197) because DEFAULT cannot sit inside coalesce
    coalesce(v_preset, (pg_catalog.floor(pg_catalog.random() * 197)::int + 1)::smallint)
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.set_avatar_preset(p_preset int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_preset is null or p_preset not between 1 and 197 then
    raise exception 'invalid_avatar_preset' using errcode = 'P0001';
  end if;
  update public.profiles set avatar_preset = p_preset::smallint where id = v_uid and deleted_at is null;
end;
$$;
revoke execute on function public.set_avatar_preset(int) from public, anon;
grant execute on function public.set_avatar_preset(int) to authenticated;
