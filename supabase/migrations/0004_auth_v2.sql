-- Auth v2: password signup with a profile created by trigger, birth date instead of
-- is_adult, split names, username lookups and a server-side login attempt limiter.

-- ---------------------------------------------------------------- profiles
alter table public.profiles
  add column first_name text,
  add column last_name text,
  add column birth_date date,
  add column terms_accepted_at timestamptz,
  add column timezone_changed_at timestamptz;

-- local rows created before v2
update public.profiles set
  first_name = coalesce(nullif(left(btrim(display_name), 40), ''), '-'),
  last_name = '-',
  birth_date = '2000-01-01',
  terms_accepted_at = created_at;

alter table public.profiles
  alter column first_name set not null,
  alter column last_name set not null,
  alter column terms_accepted_at set not null,
  add constraint profiles_first_name_length check (char_length(first_name) between 1 and 40),
  add constraint profiles_last_name_length check (char_length(last_name) between 1 and 40),
  add constraint profiles_birth_date_required check (deleted_at is not null or birth_date is not null);

-- public_profiles depends on display_name: drop, swap the column, recreate identically
drop view public.public_profiles;
alter table public.profiles drop column is_adult;
alter table public.profiles drop column display_name;
alter table public.profiles
  add column display_name text generated always as (first_name || ' ' || last_name) stored;

create view public.public_profiles as
  select id, username, display_name, avatar_path from public.profiles
  where deleted_at is null;
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- Clients never create profiles: the auth.users trigger does it. They may update
-- only these columns (timezone leaves the list in a later task).
drop policy profiles_insert_own on public.profiles;
revoke insert on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (username, first_name, last_name, avatar_path, reminder_time)
  on public.profiles to authenticated;

-- ------------------------------------------------------ signup trigger
create function public.handle_new_user()
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
  if v_birth is null then
    raise exception 'invalid_birth_date' using errcode = 'P0001';
  end if;

  -- same rule as isAdult(): year difference, minus one until MMDD is reached
  v_today := (pg_catalog.now() at time zone v_tz)::date;
  v_age := extract(year from v_today)::int - extract(year from v_birth)::int
    - case when pg_catalog.to_char(v_today, 'MMDD') < pg_catalog.to_char(v_birth, 'MMDD') then 1 else 0 end;
  if v_age < 18 then
    raise exception 'underage' using errcode = 'P0001';
  end if;

  -- username format and uniqueness are enforced by the table constraints
  insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
  values (
    new.id,
    m ->> 'username',
    pg_catalog.btrim(m ->> 'first_name'),
    pg_catalog.btrim(m ->> 'last_name'),
    v_birth,
    pg_catalog.now(),
    v_tz
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------- lookups
create function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username ~ '^[a-z0-9_]{3,20}$'
    and not exists (
      select 1 from public.profiles p
      where p.username operator(extensions.=) p_username::extensions.citext
    );
$$;
revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

create function public.email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username operator(extensions.=) p_username::extensions.citext
    and p.deleted_at is null;
$$;
revoke execute on function public.email_for_username(text) from public, anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;

-- ------------------------------------------------------ login attempts
create table public.login_attempts (
  id bigint generated always as identity primary key,
  key text not null check (char_length(key) <= 320),
  created_at timestamptz not null default now()
);
create index login_attempts_key_idx on public.login_attempts (key, created_at);
create index login_attempts_created_idx on public.login_attempts (created_at);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;

-- One attempt is recorded per key (also when blocked, so hammering keeps the lock).
-- Returns false when any key is over its 15 minute limit: ip:* 30, everything else 10.
create function public.register_login_attempt(p_keys text[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v_ok boolean := true;
  v_count int;
  v_limit int;
begin
  delete from public.login_attempts where created_at < pg_catalog.now() - interval '1 day';
  foreach k in array coalesce(p_keys, '{}'::text[]) loop
    insert into public.login_attempts (key) values (k);
    select count(*)::int into v_count
    from public.login_attempts a
    where a.key = k and a.created_at > pg_catalog.now() - interval '15 minutes';
    v_limit := case when k like 'ip:%' then 30 else 10 end;
    if v_count > v_limit then
      v_ok := false;
    end if;
  end loop;
  return v_ok;
end;
$$;
revoke execute on function public.register_login_attempt(text[]) from public, anon, authenticated;
grant execute on function public.register_login_attempt(text[]) to service_role;
