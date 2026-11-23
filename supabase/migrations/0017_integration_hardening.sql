-- Integration hardening: caps and locks found while integrating the v3 areas.

-- ============================================================ workout_day_types_valid
-- The check constraint on workout_sessions calls it, so service-role writes (account
-- deletion, seeds) need it too.
grant execute on function public.workout_day_types_valid(text[]) to service_role;

-- ============================================================ save_workout: at most 20 exercises
create or replace function public.save_workout(p_checkin_id uuid, p_day_types text[], p_sets jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_date date;
  v_habit uuid;
  v_log_type text;
  v_id uuid;
  v_el jsonb;
  v_reps numeric;
  v_kg numeric;
  v_ids uuid[] := '{}';
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select c.local_date, c.habit_id, h.log_type into v_date, v_habit, v_log_type
  from public.checkins c
  join public.habits h on h.id = c.habit_id
  where c.id = p_checkin_id and c.user_id = v_uid;
  if not found then
    raise exception 'checkin_not_found';
  end if;
  if v_log_type <> 'workout' then
    raise exception 'log_type_mismatch';
  end if;

  if not public.workout_day_types_valid(p_day_types) then
    raise exception 'invalid_day_types';
  end if;

  if jsonb_typeof(p_sets) is distinct from 'array' then
    raise exception 'invalid_set';
  end if;
  if jsonb_array_length(p_sets) > 200 then
    raise exception 'too_many_sets';
  end if;

  for v_el in select e.value from jsonb_array_elements(p_sets) e loop
    if jsonb_typeof(v_el) is distinct from 'object'
       or jsonb_typeof(v_el -> 'exercise_id') is distinct from 'string'
       or (v_el ->> 'exercise_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_el -> 'reps') is distinct from 'number'
       or jsonb_typeof(v_el -> 'kg') is distinct from 'number' then
      raise exception 'invalid_set';
    end if;
    v_reps := (v_el ->> 'reps')::numeric;
    v_kg := (v_el ->> 'kg')::numeric;
    if v_reps <> trunc(v_reps) or v_reps < 1 or v_reps > 1000
       or v_kg < 0 or v_kg > 999.99 or round(v_kg, 2) <> v_kg then
      raise exception 'invalid_set';
    end if;
    v_ids := v_ids || (v_el ->> 'exercise_id')::uuid;
  end loop;

  -- every exercise is in the catalog or is the caller's own
  if exists (
    select 1 from unnest(v_ids) i
    where not exists (
      select 1 from public.exercises x
      where x.id = i and (x.user_id is null or x.user_id = v_uid)
    )
  ) then
    raise exception 'exercise_not_found';
  end if;
  if (select count(distinct i) from unnest(v_ids) i) > 20 then
    raise exception 'too_many_exercises';
  end if;
  if exists (select 1 from unnest(v_ids) i group by i having count(*) > 10) then
    raise exception 'too_many_sets';
  end if;

  insert into public.workout_sessions as s (user_id, habit_id, checkin_id, local_date, day_types)
  values (v_uid, v_habit, p_checkin_id, v_date, p_day_types)
  on conflict (checkin_id) do update
    set day_types = excluded.day_types, updated_at = pg_catalog.now()
  returning s.id into v_id;

  delete from public.workout_sets w where w.session_id = v_id;
  insert into public.workout_sets (session_id, user_id, local_date, exercise_id, position, reps, weight_kg)
  select v_id, v_uid, v_date, (e.value ->> 'exercise_id')::uuid, (e.ordinality - 1)::smallint,
         (e.value ->> 'reps')::int, (e.value ->> 'kg')::numeric
  from jsonb_array_elements(p_sets) with ordinality e;

  return v_id;
end;
$$;

-- ============================================================ own exercises
-- At most 100 active own exercises, and never the name of a catalog exercise (any case).
create function public.exercises_own_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.exercises x
    where x.user_id is null and lower(x.name) = lower(new.name)
  ) then
    raise exception 'exercise_name_catalog' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and new.archived_at is null and (
    select count(*) from public.exercises x
    where x.user_id = new.user_id and x.archived_at is null
  ) >= 100 then
    raise exception 'exercise_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.exercises_own_guard() from public, anon, authenticated;
create trigger exercises_own_guard
  before insert or update of name on public.exercises
  for each row execute function public.exercises_own_guard();

-- ============================================================ books.finished_on lower bound
create or replace function public.books_finished_on_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.finished_on is not null and (
    new.finished_on < date '1900-01-01'
    or new.finished_on > (
      pg_catalog.now() at time zone (select p.timezone from public.profiles p where p.id = new.user_id)
    )::date
  ) then
    raise exception 'invalid_finished_on' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ============================================================ invites: row locks
-- Two concurrent acceptances could both read uses = 19 and push a code past 20; two
-- concurrent creations could both count 4 active codes. Lock before reading.
create or replace function public.create_invite()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  perform 1 from public.profiles p where p.id = v_uid for update;
  if (select count(*) from public.invites i
      where i.inviter_id = v_uid and i.expires_at > now() and i.uses < 20) >= 5 then
    raise exception 'invite_limit';
  end if;
  insert into public.invites (inviter_id, expires_at)
  values (v_uid, now() + interval '7 days')
  returning code into v_code;
  return v_code;
end;
$$;

create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.invites%rowtype;
  v_friendship public.friendships%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select i.* into v_invite
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and p.deleted_at is null
  where i.code = p_code
  for update of i;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if v_invite.expires_at <= now() or v_invite.uses >= 20 then
    raise exception 'invite_expired';
  end if;
  if v_invite.inviter_id = v_uid then
    raise exception 'invite_self';
  end if;

  select f.* into v_friendship
  from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(v_uid, v_invite.inviter_id)
    and greatest(f.requester_id, f.addressee_id) = greatest(v_uid, v_invite.inviter_id)
  for update;
  if not found then
    insert into public.friendships (requester_id, addressee_id, status)
    values (v_invite.inviter_id, v_uid, 'accepted');
    update public.invites set uses = uses + 1 where id = v_invite.id;
  elsif v_friendship.status = 'pending' then
    update public.friendships set status = 'accepted' where id = v_friendship.id;
    update public.invites set uses = uses + 1 where id = v_invite.id;
  end if;
  return v_invite.inviter_id;
end;
$$;

-- ============================================================ challenges.cancelled_at
-- Debts are billed for periods that ended before cancelled_at, so once stamped it never
-- moves or clears; only the trigger ever sets it.
create or replace function public.challenges_stamp_cancelled()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.cancelled_at is not null then
    new.cancelled_at := old.cancelled_at;
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := now();
  else
    new.cancelled_at := null;
  end if;
  return new;
end;
$$;

drop trigger challenges_stamp_cancelled on public.challenges;
create trigger challenges_stamp_cancelled
  before update on public.challenges
  for each row execute function public.challenges_stamp_cancelled();
