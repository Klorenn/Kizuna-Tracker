-- Final hardening: pomodoro credit never backdated, cardio delete answers entry_not_found,
-- closed-period check-ins cannot be deleted by a client, exercise cap on un-archive, lighter
-- create_invite lock, the cron secret verified in the database and an unread-notifications index.

-- ============================================================ H1 add_pomodoro_block(p_ended_at)
-- 0018's function plus an optional end instant. Null behaves as before; a given instant must not be
-- more than two minutes in the future and must fall on the caller's current local date.
drop function public.add_pomodoro_block(uuid, uuid, int, text);

-- Idempotent by block id: the receipt is written first; a block that already has one credits
-- nothing and does not touch the check-in.
create function public.add_pomodoro_block(
  p_habit_id uuid, p_block_id uuid, p_minutes int, p_topic text default null, p_ended_at timestamptz default null
)
returns table (checkin_id uuid, total_minutes int, credited boolean, checkin_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_today date;
  v_tz text;
  v_type text;
  v_topic text;
  v_inserted uuid;
  v_owner uuid;
  v_cid uuid;
  v_created boolean;
  v_total int;
begin
  select a.uid, a.today into v_uid, v_today from public.v4_actor() a;

  select h.log_type into v_type
  from public.habits h
  where h.id = p_habit_id and h.user_id = v_uid and h.archived_at is null;
  if not found then
    raise exception 'habit_not_found';
  end if;
  if v_type <> 'time' then
    raise exception 'log_type_mismatch';
  end if;
  if p_block_id is null then
    raise exception 'invalid_block';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 90 then
    raise exception 'invalid_minutes';
  end if;
  -- a block that ended before today (profile zone) or later than two minutes from now is not credited.
  -- A block this caller already has a receipt for keeps its idempotent answer (credited = false) on a
  -- retry, whatever day it is by then, so the rule only applies to blocks not credited yet.
  if p_ended_at is not null and not exists (
    select 1 from public.pomodoro_blocks b where b.block_id = p_block_id and b.user_id = v_uid
  ) then
    select p.timezone into v_tz from public.profiles p where p.id = v_uid;
    if p_ended_at > pg_catalog.now() + interval '2 minutes'
       or (p_ended_at at time zone v_tz)::date <> v_today then
      raise exception 'block_expired';
    end if;
  end if;
  v_topic := public.v4_topic(p_topic);

  insert into public.pomodoro_blocks as b (block_id, user_id, habit_id, local_date, minutes)
  values (p_block_id, v_uid, p_habit_id, v_today, p_minutes)
  on conflict (block_id) do nothing
  returning b.block_id into v_inserted;

  if v_inserted is null then
    select b.user_id into v_owner from public.pomodoro_blocks b where b.block_id = p_block_id;
    if v_owner is distinct from v_uid then
      raise exception 'invalid_block';
    end if;
    select t.checkin_id, t.minutes into v_cid, v_total
    from public.time_entries t
    where t.user_id = v_uid and t.habit_id = p_habit_id and t.local_date = v_today;
    return query select v_cid, coalesce(v_total, 0), false, false;
    return;
  end if;

  select c.checkin_id, c.created into v_cid, v_created from public.create_checkin(p_habit_id) c;

  insert into public.time_entries as t (user_id, habit_id, checkin_id, local_date, minutes, topic, pomodoros)
  values (v_uid, p_habit_id, v_cid, v_today, p_minutes, v_topic, 1)
  on conflict on constraint time_entries_checkin_key do update
    set minutes = t.minutes + excluded.minutes,
        pomodoros = least(t.pomodoros + 1, 288),
        topic = coalesce(excluded.topic, t.topic),
        updated_at = pg_catalog.now()
    where t.minutes + excluded.minutes <= 1440
  returning t.minutes into v_total;
  if v_total is null then
    raise exception 'minutes_over_day';
  end if;

  update public.pomodoro_blocks b set checkin_id = v_cid where b.block_id = p_block_id;
  return query select v_cid, v_total, true, v_created;
end;
$$;
revoke execute on function public.add_pomodoro_block(uuid, uuid, int, text, timestamptz) from public, anon;
grant execute on function public.add_pomodoro_block(uuid, uuid, int, text, timestamptz) to authenticated;

-- ============================================================ H2 delete_cardio_entry: entry_not_found
-- Same answer as update_cardio_entry for an unknown id and for someone else's entry.
create or replace function public.delete_cardio_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  select a.uid into v_uid from public.v4_actor() a;
  delete from public.cardio_entries e where e.id = p_entry_id and e.user_id = v_uid;
  if not found then
    raise exception 'entry_not_found';
  end if;
end;
$$;

-- ============================================================ H3 closed-period check-ins
-- True when the caller's habit has a challenge period that is already closed and covers the date
-- (the rule remove_quantity_entry applies). False for habits that are not the caller's, so ids
-- cannot be probed. Callable by clients because the guard trigger below runs as the invoker.
create function public.habit_date_period_closed(p_habit_id uuid, p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return exists (
    select 1
    from public.habits h
    join public.challenges ch on ch.creator_habit_id = h.id or ch.rival_habit_id = h.id
    join public.challenge_periods cp on cp.challenge_id = ch.id
    where h.id = p_habit_id and h.user_id = v_uid
      and cp.closed_at is not null
      and p_date between cp.period_start and cp.period_end
  );
end;
$$;
revoke execute on function public.habit_date_period_closed(uuid, date) from public, anon;
grant execute on function public.habit_date_period_closed(uuid, date) to authenticated;

-- A direct client delete of a check-in inside a closed period is refused. SECURITY INVOKER on
-- purpose (like checkins_quantity_guard): inside a definer RPC current_user is the owner, for a
-- direct client delete it is `authenticated`. The service role (account deletion) is not affected.
--
-- What "closed" means: a challenge_periods row with closed_at set. Those rows are only created when
-- the close-periods cron settles a period, which waits until the period has ended in the challenge's
-- zone AND every photo check-in of it is older than 24 hours. So deletes are NOT guarded between a
-- period's end and its close (up to about a day after the last photo, or for as long as the cron is
-- down). That window cannot benefit the deleting player: each player is judged only on their own
-- check-ins (evaluatePeriod), and a client can only delete its own, so a deletion can only make the
-- deleting player fail. Follow-up if wanted: also guard dates up to a period's end once it has ended
-- in the challenge's zone.
create function public.checkins_period_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if public.habit_date_period_closed(old.habit_id, old.local_date) then
      raise exception 'period_closed';
    end if;
  end if;
  return old;
end;
$$;
revoke execute on function public.checkins_period_guard() from public, anon, authenticated;
create trigger checkins_period_guard
  before delete on public.checkins
  for each row execute function public.checkins_period_guard();

-- The helper joins challenges on either habit column; neither was indexed.
create index challenges_creator_habit_idx on public.challenges (creator_habit_id);
create index challenges_rival_habit_idx on public.challenges (rival_habit_id);

-- uncheck_item is 0018's plus the same refusal, before anything is deleted.
create or replace function public.uncheck_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_habit uuid;
  v_log_type text;
  v_date date;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select p.timezone into v_tz from public.profiles p
  where p.id = v_uid and p.deleted_at is null;
  if not found then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select i.habit_id, h.log_type into v_habit, v_log_type
  from public.habit_items i
  join public.habits h on h.id = i.habit_id
  where i.id = p_item_id and i.user_id = v_uid;
  if not found then
    raise exception 'item_not_found';
  end if;
  if v_log_type = 'quantity' then
    raise exception 'quantity_habit';
  end if;

  v_date := (now() at time zone v_tz)::date;

  if exists (
    select 1 from public.checkins c
    where c.habit_id = v_habit and c.local_date = v_date and c.rejected_at is not null
  ) then
    raise exception 'checkin_rejected';
  end if;
  if public.habit_date_period_closed(v_habit, v_date) then
    raise exception 'period_closed';
  end if;

  delete from public.checkin_items ci
  where ci.item_id = p_item_id and ci.local_date = v_date and ci.user_id = v_uid;
  delete from public.checkins c
  where c.habit_id = v_habit and c.local_date = v_date and c.user_id = v_uid
    and c.rejected_at is null;
end;
$$;

-- ============================================================ H4 exercise cap on un-archive
-- 0017's guard plus the cap on the archived -> active transition. The catalog-name check does not
-- run on a pure archive flip (name untouched). The count is taken under a per-user transaction
-- advisory lock so concurrent creates / un-archives cannot all pass at 99.
create or replace function public.exercises_own_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.name is distinct from old.name or new.archived_at is not distinct from old.archived_at)
     and exists (
       select 1 from public.exercises x
       where x.user_id is null and lower(x.name) = lower(new.name)
     ) then
    raise exception 'exercise_name_catalog' using errcode = 'P0001';
  end if;
  if new.archived_at is null and (tg_op = 'INSERT' or old.archived_at is not null) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('exercises_cap:' || new.user_id::text, 0));
    if (
      select count(*) from public.exercises x
      where x.user_id = new.user_id and x.archived_at is null
    ) >= 100 then
      raise exception 'exercise_limit' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger exercises_own_guard on public.exercises;
create trigger exercises_own_guard
  before insert or update of name, archived_at on public.exercises
  for each row execute function public.exercises_own_guard();

-- ============================================================ H5 create_invite lock
-- 0017's function with FOR NO KEY UPDATE: concurrent calls of the same user still serialize
-- (the mode conflicts with itself, so both cannot count 4 codes), but inserts of rows that
-- reference the profile (FOR KEY SHARE) no longer wait. Deleted callers are rejected here too.
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
  perform 1 from public.profiles p where p.id = v_uid and p.deleted_at is null for no key update;
  if not found then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
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

-- ============================================================ H7 cron secret in the database
-- Setup, current instructions (0008's header comment predates this migration):
--  * cron_secret is generated by this migration (random, 64 hex). Nothing to set. The app accepts it
--    through cron_secret_valid(), so CRON_SECRET in the app env is optional.
--  * app_url is per environment, set once (SQL editor, as postgres):
--      select vault.create_secret('<site origin, e.g. https://your-app.example.com>', 'app_url');
--  * to align the database secret with a CRON_SECRET env value, or to rotate it, update in place
--    (do NOT create_secret again, the name is unique):
--      select vault.update_secret(id, '<new value>') from vault.secrets where name = 'cron_secret';
--    A custom value must be 64 lower-case hex characters to be accepted through the database check.
-- Creates the vault secret `cron_secret` (random, 64 hex) when missing; never returns or logs it.
-- app_url stays environment-specific and is not created here.
create function public.ensure_cron_secret()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  if not exists (select 1 from vault.secrets s where s.name = 'cron_secret') then
    perform vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_secret',
      'bearer token for /api/cron/* (generated by migration 0020)'
    );
  end if;
end;
$$;
revoke execute on function public.ensure_cron_secret() from public, anon, authenticated, service_role;
select public.ensure_cron_secret();

-- True only for a token of at least 32 characters whose sha256 equals that of the stored secret.
create function public.cron_secret_valid(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stored text;
begin
  if p_secret is null or pg_catalog.char_length(p_secret) < 32 then
    return false;
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  select d.decrypted_secret into v_stored from vault.decrypted_secrets d where d.name = 'cron_secret' limit 1;
  if v_stored is null then
    return false;
  end if;
  return pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8'))
       = pg_catalog.sha256(pg_catalog.convert_to(v_stored, 'UTF8'));
end;
$$;
revoke execute on function public.cron_secret_valid(text) from public, anon, authenticated;
grant execute on function public.cron_secret_valid(text) to service_role;

-- ============================================================ H8 unread notifications
-- NotificationBell counts rows with read_at is null (RLS adds user_id = auth.uid()).
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
