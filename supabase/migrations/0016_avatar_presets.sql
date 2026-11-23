-- Preset cat avatars: every profile owns one of eight bundled images (public/avatars/preset-N.webp).
-- It is the fallback when there is no uploaded photo. Random at signup unless the signup form sends
-- a valid choice; clients change it only through set_avatar_preset().

-- Volatile default: Postgres evaluates it per row, so existing rows are backfilled randomly too.
alter table public.profiles
  add column avatar_preset smallint not null
    default (pg_catalog.floor(pg_catalog.random() * 8)::int + 1)
    constraint profiles_avatar_preset_range check (avatar_preset between 1 and 8);

-- ------------------------------------------------------ signup trigger
-- Same body as 0004 plus the optional preset from the signup metadata: honored only when it is a
-- JSON integer in 1..8, otherwise the random column default applies.
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

  -- a JSON number written as a plain integer 1..8 (no string, fraction or exponent)
  if pg_catalog.jsonb_typeof(m -> 'avatar_preset') = 'number' and (m ->> 'avatar_preset') ~ '^[1-8]$' then
    v_preset := (m ->> 'avatar_preset')::smallint;
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
    -- fallback repeats the column default (random 1..8) because DEFAULT cannot sit inside coalesce
    coalesce(v_preset, (pg_catalog.floor(pg_catalog.random() * 8)::int + 1)::smallint)
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ------------------------------------------------------ changing the preset
-- The only client path to the column: no direct UPDATE grant. Definer + deleted-account guard,
-- like the 0015 RPCs.
create function public.set_avatar_preset(p_preset int)
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
  if p_preset is null or p_preset not between 1 and 8 then
    raise exception 'invalid_avatar_preset' using errcode = 'P0001';
  end if;
  update public.profiles set avatar_preset = p_preset::smallint where id = v_uid and deleted_at is null;
end;
$$;
revoke execute on function public.set_avatar_preset(int) from public, anon;
grant execute on function public.set_avatar_preset(int) to authenticated;

-- ------------------------------------------------------ public surfaces
-- Same filter and grants as 0004; the list stays explicit (nothing else is exposed).
drop view public.public_profiles;
create view public.public_profiles as
  select id, username, display_name, avatar_path, avatar_preset from public.profiles
  where deleted_at is null;
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- Invite confirmation: who invited, now with the preset.
create or replace function public.invite_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'username', p.username::text,
    'displayName', p.display_name,
    'avatarPath', p.avatar_path,
    'avatarPreset', p.avatar_preset
  )
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and p.deleted_at is null
  where i.code = p_code and i.expires_at > now() and i.uses < 20
    and (select auth.uid()) is not null;
$$;
revoke execute on function public.invite_preview(text) from public, anon;
grant execute on function public.invite_preview(text) to authenticated;

-- Public profile: same whitelist as 0013 plus the preset.
create or replace function public.public_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_habits jsonb;
begin
  select p.id, p.username::text as username, p.display_name, p.avatar_path, p.avatar_updated_at, p.avatar_preset
    into v_profile
  from public.profiles p
  where p.username = p_username::extensions.citext and p.deleted_at is null;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'name', h.name,
      'icon', h.icon,
      'color', h.color,
      'frequencyType', h.frequency_type,
      'targetPerWeek', h.target_per_week,
      'dates', coalesce((
        select jsonb_agg(to_char(c.local_date, 'YYYY-MM-DD') order by c.local_date)
        from public.checkins c
        where c.habit_id = h.id
          and c.rejected_at is null
          and c.local_date >= current_date - 182
      ), '[]'::jsonb)
    ) order by h.created_at), '[]'::jsonb)
    into v_habits
  from public.habits h
  where h.user_id = v_profile.id and h.visibility = 'public' and h.archived_at is null;

  if jsonb_array_length(v_habits) = 0 and (select auth.uid()) is null then
    return null;
  end if;

  return jsonb_build_object(
    'username', v_profile.username,
    'displayName', v_profile.display_name,
    'avatarPath', v_profile.avatar_path,
    'avatarUpdatedAt', v_profile.avatar_updated_at,
    'avatarPreset', v_profile.avatar_preset,
    'habits', v_habits
  );
end;
$$;
revoke execute on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;
