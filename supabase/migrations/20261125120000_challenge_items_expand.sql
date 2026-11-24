-- Sub-retos: a challenge holds N items (challenge_items), each one a habit pair. EXPAND only: the legacy habit
-- columns of public.challenges stay and are mirrored from the primary item (the live item with the lowest
-- position), so older code, direct inserts and the existing tests keep working. Everything is idempotent.
--
--  * challenge_items is the source of truth for "which habit is in a challenge"; every guard and RPC reads it.
--  * An item counts as open when it is live (proposed/active) AND its challenge is live (proposed/active):
--    cancelling, unfriending or deleting an account never writes item status.
--  * challenge_item_results stores one row per closed period, item and player (met, done, needed).
--  * Rollout: apply this migration BEFORE deploying the code that uses it. See docs/CHALLENGE_ITEMS.md.

-- ============================================================ a. tables
create table if not exists public.challenge_items (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id),
  position smallint not null check (position between 1 and 50),
  creator_habit_id uuid references public.habits (id),
  rival_habit_id uuid references public.habits (id),
  target_per_week int check (target_per_week between 1 and 7), -- null = daily (the challenge's frequency_type decides)
  requires_photo boolean not null default false,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'declined', 'withdrawn')),
  proposed_by uuid not null references public.profiles (id),
  starts_on date,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint challenge_items_position_key unique (challenge_id, position),
  constraint challenge_items_one_side check (creator_habit_id is not null or rival_habit_id is not null),
  constraint challenge_items_active_complete check (
    status <> 'active' or (creator_habit_id is not null and rival_habit_id is not null and starts_on is not null)
  )
);
create unique index if not exists challenge_items_live_creator_habit
  on public.challenge_items (challenge_id, creator_habit_id)
  where status in ('proposed', 'active') and creator_habit_id is not null;
create unique index if not exists challenge_items_live_rival_habit
  on public.challenge_items (challenge_id, rival_habit_id)
  where status in ('proposed', 'active') and rival_habit_id is not null;
create index if not exists challenge_items_creator_habit_idx on public.challenge_items (creator_habit_id);
create index if not exists challenge_items_rival_habit_idx on public.challenge_items (rival_habit_id);

create table if not exists public.challenge_item_results (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id),
  period_start date not null,
  item_id uuid not null references public.challenge_items (id),
  player_id uuid not null references public.profiles (id),
  met boolean not null,
  done smallint not null check (done >= 0),
  needed smallint not null check (needed between 1 and 7),
  created_at timestamptz not null default now(),
  constraint challenge_item_results_key unique (challenge_id, period_start, item_id, player_id)
);
create index if not exists challenge_item_results_item_idx on public.challenge_item_results (item_id);

-- ============================================================ b. RLS, grants, deleted-actor triggers
-- Like challenge_periods (0002): participants read, nobody writes from the client. Writes go through the RPCs
-- below and the service role (cron).
alter table public.challenge_items enable row level security;
alter table public.challenge_item_results enable row level security;
revoke all on public.challenge_items, public.challenge_item_results from public, anon, authenticated;

drop policy if exists challenge_items_select_participants on public.challenge_items;
create policy challenge_items_select_participants on public.challenge_items
  for select to authenticated
  using (exists (
    select 1 from public.challenges c
    where c.id = challenge_id
      and (c.creator_id = (select auth.uid()) or c.rival_id = (select auth.uid()))
  ));
drop policy if exists challenge_item_results_select_participants on public.challenge_item_results;
create policy challenge_item_results_select_participants on public.challenge_item_results
  for select to authenticated
  using (exists (
    select 1 from public.challenges c
    where c.id = challenge_id
      and (c.creator_id = (select auth.uid()) or c.rival_id = (select auth.uid()))
  ));
grant select on public.challenge_items, public.challenge_item_results to authenticated;
-- 0012's blanket grant only covered the tables that existed then
grant select, insert, update, delete on public.challenge_items, public.challenge_item_results to service_role;

drop trigger if exists challenge_items_forbid_deleted_actor on public.challenge_items;
create trigger challenge_items_forbid_deleted_actor before insert or update or delete on public.challenge_items
  for each statement execute function public.forbid_deleted_actor();
drop trigger if exists challenge_item_results_forbid_deleted_actor on public.challenge_item_results;
create trigger challenge_item_results_forbid_deleted_actor before insert or update or delete on public.challenge_item_results
  for each statement execute function public.forbid_deleted_actor();

-- ============================================================ c. seed trigger and backfill
-- One item #1 per challenge, built from the legacy columns. The same function backs the backfill and the AFTER
-- INSERT trigger, so a client insert on challenges (RLS policy from 0007, unchanged) keeps working.
create or replace function public.challenge_items_seed(c public.challenges)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.challenge_items (challenge_id, position, creator_habit_id, rival_habit_id, target_per_week, requires_photo,
                                      status, proposed_by, starts_on, accepted_at, created_at)
  select c.id, 1, c.creator_habit_id, c.rival_habit_id, c.target_per_week, c.requires_photo,
         case when c.rival_habit_id is not null and c.starts_on is not null then 'active'
              when c.status in ('proposed', 'active') then 'proposed' -- live but not started (an active item needs a start date)
              when c.status = 'declined' then 'declined'
              else 'withdrawn' end,
         c.creator_id, c.starts_on, case when c.rival_habit_id is not null then c.created_at end, c.created_at
  where not exists (select 1 from public.challenge_items i where i.challenge_id = c.id);
$$;
revoke execute on function public.challenge_items_seed(public.challenges) from public, anon, authenticated;

create or replace function public.challenges_seed_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.challenge_items_seed(new);
  return null;
end;
$$;
revoke execute on function public.challenges_seed_item() from public, anon, authenticated;
drop trigger if exists challenges_seed_item on public.challenges;
create trigger challenges_seed_item after insert on public.challenges
  for each row execute function public.challenges_seed_item();

do $$
begin
  perform public.challenge_items_seed(c)
  from public.challenges c
  where not exists (select 1 from public.challenge_items i where i.challenge_id = c.id);
end;
$$;

-- ============================================================ d. sync triggers (legacy columns <-> primary item)
-- Both are guarded by pg_trigger_depth() > 1: a write made by the other mirror never fires back.
create or replace function public.challenge_items_sync_legacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.challenge_items%rowtype;
begin
  if pg_catalog.pg_trigger_depth() > 1 then
    return null;
  end if;
  select i.* into p
  from public.challenge_items i
  where i.challenge_id = new.challenge_id and i.status in ('proposed', 'active')
  order by i.position
  limit 1;
  if not found then
    return null;
  end if;
  update public.challenges c
  set creator_habit_id = coalesce(p.creator_habit_id, c.creator_habit_id),
      rival_habit_id = coalesce(p.rival_habit_id, c.rival_habit_id),
      target_per_week = coalesce(p.target_per_week, c.target_per_week),
      requires_photo = p.requires_photo
  where c.id = p.challenge_id
    and (c.creator_habit_id, c.rival_habit_id, c.target_per_week, c.requires_photo)
        is distinct from (coalesce(p.creator_habit_id, c.creator_habit_id), coalesce(p.rival_habit_id, c.rival_habit_id),
                          coalesce(p.target_per_week, c.target_per_week), p.requires_photo);
  return null;
end;
$$;
revoke execute on function public.challenge_items_sync_legacy() from public, anon, authenticated;
drop trigger if exists challenge_items_sync_legacy on public.challenge_items;
create trigger challenge_items_sync_legacy
  after insert or update of status, creator_habit_id, rival_habit_id, target_per_week, requires_photo on public.challenge_items
  for each row execute function public.challenge_items_sync_legacy();

-- Direct writes to the legacy columns (tests, the service role) reach the items: the habits to the primary item, the new
-- start date to the active items that started with the challenge, and an accepted challenge activates its primary item.
create or replace function public.challenges_sync_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.challenge_items%rowtype;
begin
  if pg_catalog.pg_trigger_depth() > 1 then
    return null;
  end if;
  if new.starts_on is distinct from old.starts_on then
    update public.challenge_items i
    set starts_on = new.starts_on
    where i.challenge_id = new.id and i.status = 'active' and i.starts_on is not distinct from old.starts_on;
  end if;
  select i.* into p
  from public.challenge_items i
  where i.challenge_id = new.id and i.status in ('proposed', 'active')
  order by i.position
  limit 1;
  if not found then
    return null;
  end if;
  update public.challenge_items i
  set creator_habit_id = coalesce(new.creator_habit_id, i.creator_habit_id),
      rival_habit_id = coalesce(new.rival_habit_id, i.rival_habit_id),
      target_per_week = new.target_per_week,
      requires_photo = new.requires_photo
  where i.id = p.id
    and (i.creator_habit_id, i.rival_habit_id, i.target_per_week, i.requires_photo)
        is distinct from (coalesce(new.creator_habit_id, i.creator_habit_id), coalesce(new.rival_habit_id, i.rival_habit_id),
                          new.target_per_week, new.requires_photo);
  if p.status = 'proposed' and new.rival_habit_id is not null and new.starts_on is not null then
    update public.challenge_items i
    set status = 'active', starts_on = new.starts_on, accepted_at = coalesce(i.accepted_at, pg_catalog.now())
    where i.id = p.id;
  end if;
  return null;
end;
$$;
revoke execute on function public.challenges_sync_items() from public, anon, authenticated;
drop trigger if exists challenges_sync_items on public.challenges;
create trigger challenges_sync_items
  after update of creator_habit_id, rival_habit_id, target_per_week, requires_photo, starts_on, status on public.challenges
  for each row execute function public.challenges_sync_items();

-- ============================================================ e1. next_item_start (internal)
-- The first period boundary strictly after "now" in the challenge's timezone, never before the challenge start; null
-- when no whole period is left (the last period start is the latest an item can start on).
create or replace function public.next_item_start(c public.challenges)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date;
  v_start date;
  v_last date;
begin
  if c.starts_on is null then
    return null;
  end if;
  v_today := (pg_catalog.now() at time zone c.timezone)::date;
  if c.frequency_type = 'daily' then
    v_start := v_today + 1;
    v_last := c.starts_on + c.weeks * 7 - 1;
  else
    v_start := c.starts_on + (7 * pg_catalog.ceil(greatest(v_today + 1 - c.starts_on, 0) / 7.0))::int;
    v_last := c.starts_on + (c.weeks - 1) * 7;
  end if;
  v_start := greatest(v_start, c.starts_on);
  if v_start > v_last then
    return null;
  end if;
  return v_start;
end;
$$;
revoke execute on function public.next_item_start(public.challenges) from public, anon, authenticated;

-- ============================================================ e2. guards read items
-- Same messages and shape as before; the predicate is "item live AND challenge live". Bodies copied from the latest
-- definitions: 0005 (visibility, photo, habit_items), 0018 (quantity, remove_quantity_entry), 0021 (switch), 0023
-- (habit_date_period_closed), 0007 (reject_checkin).
create or replace function public.habits_visibility_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility = 'private' and old.visibility <> 'private' and exists (
    select 1
    from public.challenge_items i
    join public.challenges c on c.id = i.challenge_id
    where i.status in ('proposed', 'active') and c.status in ('proposed', 'active')
      and (i.creator_habit_id = new.id or i.rival_habit_id = new.id)
  ) then
    raise exception 'habit_in_challenge';
  end if;
  return new;
end;
$$;

create or replace function public.habits_photo_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requires_photo and exists (
    select 1 from public.habit_items i
    where i.habit_id = new.id and i.archived_at is null
  ) then
    raise exception 'photo_conflict';
  end if;
  if old.requires_photo and not new.requires_photo and exists (
    select 1
    from public.challenge_items i
    join public.challenges c on c.id = i.challenge_id
    where i.status in ('proposed', 'active') and c.status in ('proposed', 'active') and i.requires_photo
      and (i.creator_habit_id = new.id or i.rival_habit_id = new.id)
  ) then
    raise exception 'habit_in_challenge';
  end if;
  return new;
end;
$$;

create or replace function public.habit_items_challenge_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or (old.archived_at is null and new.archived_at is not null)) and exists (
    select 1
    from public.challenge_items i
    join public.challenges c on c.id = i.challenge_id
    where i.status in ('proposed', 'active') and c.status in ('proposed', 'active') and i.requires_photo
      and (i.creator_habit_id = new.habit_id or i.rival_habit_id = new.habit_id)
  ) then
    raise exception 'habit_in_challenge';
  end if;
  return new;
end;
$$;

create or replace function public.habits_quantity_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.log_type = 'quantity' and (
    new.quantity_target is null or new.quantity_target < old.quantity_target
    or new.quantity_unit is distinct from old.quantity_unit
    or new.quantity_label is distinct from old.quantity_label
    or new.log_type is distinct from old.log_type
  ) and exists (
    select 1
    from public.challenge_items i
    join public.challenges c on c.id = i.challenge_id
    where i.status in ('proposed', 'active') and c.status in ('proposed', 'active')
      and (i.creator_habit_id = new.id or i.rival_habit_id = new.id)
  ) then
    raise exception 'habit_in_challenge';
  end if;
  return new;
end;
$$;

-- SECURITY INVOKER on purpose (see 0021): the owner of the habit reads its items through the participant select policy.
create or replace function public.habits_switch_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.log_type = 'quantity' and old.log_type is distinct from 'quantity' and exists (
    select 1
    from public.challenge_items i
    join public.challenges c on c.id = i.challenge_id
    where i.status in ('proposed', 'active') and c.status in ('proposed', 'active')
      and (i.creator_habit_id = new.id or i.rival_habit_id = new.id)
  ) then
    raise exception 'habit_in_challenge';
  end if;

  if (new.log_type is distinct from old.log_type and (new.log_type = 'quantity' or old.log_type = 'quantity'))
     or (old.log_type = 'quantity' and new.log_type = 'quantity' and new.quantity_unit is distinct from old.quantity_unit) then
    select (pg_catalog.now() at time zone p.timezone)::date into v_today
    from public.profiles p where p.id = new.user_id;
    if v_today is not null and exists (
      select 1 from public.checkins c where c.habit_id = new.id and c.local_date = v_today
    ) then
      raise exception 'checkin_today';
    end if;
  end if;
  return new;
end;
$$;

-- The challenge half resolves through the ACTIVE item: dates before the item's starts_on are not locked by it.
create or replace function public.habit_date_period_closed(p_habit_id uuid, p_date date)
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
    join public.challenge_items i on (i.creator_habit_id = h.id or i.rival_habit_id = h.id) and i.status = 'active'
    join public.challenge_periods cp on cp.challenge_id = i.challenge_id
    where h.id = p_habit_id and h.user_id = v_uid
      and cp.closed_at is not null
      and p_date between cp.period_start and cp.period_end
      and p_date >= i.starts_on
  ) or exists (
    select 1
    from public.group_members m
    join public.groups g on g.id = m.group_id
    join public.group_weeks w on w.group_id = m.group_id
    where m.habit_id = p_habit_id and m.user_id = v_uid
      and p_date between w.week_start and w.week_start + 6
      and p_date >= m.joined_on
      and (m.left_at is null or p_date <= (m.left_at at time zone g.timezone)::date)
  );
end;
$$;

create or replace function public.remove_quantity_entry(p_entry_id uuid)
returns table (total numeric, target numeric, done boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_today date;
  v_habit uuid;
  v_date date;
  v_type text;
  v_target numeric;
  v_total numeric;
begin
  select a.uid, a.today into v_uid, v_today from public.v4_actor() a;

  select e.habit_id, e.local_date into v_habit, v_date
  from public.quantity_entries e
  where e.id = p_entry_id and e.user_id = v_uid;
  if not found then
    raise exception 'entry_not_found';
  end if;
  if v_date <> v_today then
    raise exception 'entry_not_today';
  end if;

  select h.log_type, h.quantity_target into v_type, v_target
  from public.habits h
  where h.id = v_habit and h.user_id = v_uid and h.archived_at is null
  for update;
  if not found then
    raise exception 'habit_not_found';
  end if;
  if v_type <> 'quantity' then
    raise exception 'log_type_mismatch';
  end if;

  delete from public.quantity_entries e where e.id = p_entry_id;
  select coalesce(sum(e.amount), 0) into v_total
  from public.quantity_entries e where e.habit_id = v_habit and e.local_date = v_today;

  -- under the goal the check-in goes away, unless today is in a period that is already closed
  -- for an active item of the habit (an item does not lock the days before its start)
  if v_total < v_target and not exists (
    select 1
    from public.challenge_items i
    join public.challenge_periods cp on cp.challenge_id = i.challenge_id
    where (i.creator_habit_id = v_habit or i.rival_habit_id = v_habit)
      and i.status = 'active'
      and cp.closed_at is not null
      and v_today between cp.period_start and cp.period_end
      and v_today >= i.starts_on
  ) then
    delete from public.checkins c where c.habit_id = v_habit and c.local_date = v_today;
  end if;

  return query select v_total, v_target, exists (
    select 1 from public.checkins c where c.habit_id = v_habit and c.local_date = v_today
  );
end;
$$;

-- ============================================================ e3. reject_checkin
-- The rival of an ACTIVE PHOTO ITEM of an active challenge rejects the owner's photo (24 h window as before). The item
-- sets the start; the challenge still sets the end.
create or replace function public.reject_checkin(p_checkin_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  k public.checkins%rowtype;
  v_challenge uuid;
  v_item uuid;
  v_starts date;
  v_cstarts date;
  v_weeks int;
  v_tz text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_reason is null or p_reason not in ('not_habit', 'duplicate', 'unclear', 'other') then
    raise exception 'invalid_reason';
  end if;
  select * into k from public.checkins where id = p_checkin_id for update;
  if not found or k.photo_path is null then
    raise exception 'checkin_not_found';
  end if;

  select c.id, i.id, i.starts_on, c.starts_on, c.weeks, c.timezone
  into v_challenge, v_item, v_starts, v_cstarts, v_weeks, v_tz
  from public.challenge_items i
  join public.challenges c on c.id = i.challenge_id
  where c.status = 'active'
    and i.status = 'active'
    and i.requires_photo
    and ((c.creator_id = v_uid and c.rival_id = k.user_id and i.rival_habit_id = k.habit_id)
      or (c.rival_id = v_uid and c.creator_id = k.user_id and i.creator_habit_id = k.habit_id))
  limit 1;
  if v_challenge is null then
    raise exception 'not_rival';
  end if;
  if k.rejected_at is not null then
    raise exception 'already_rejected';
  end if;
  -- only check-ins that belong to the item's schedule, and only once it has started
  if v_starts is null
     or k.local_date < v_starts
     or k.local_date > v_cstarts + v_weeks * 7 - 1
     or v_starts > (now() at time zone v_tz)::date then
    raise exception 'checkin_out_of_range';
  end if;
  if k.created_at + interval '24 hours' <= now() then
    raise exception 'reject_window_closed';
  end if;

  update public.checkins
  set rejected_at = now(), rejected_by = v_uid, reject_reason = p_reason
  where id = k.id;
  insert into public.notifications (user_id, type, payload)
  values (k.user_id, 'photo_rejected', jsonb_build_object(
    'checkin_id', k.id, 'habit_id', k.habit_id, 'challenge_id', v_challenge, 'item_id', v_item,
    'reason', p_reason, 'rejected_by', v_uid));
end;
$$;

-- ============================================================ f1. respond_challenge (4 params)
-- While the challenge is proposed the rival answers ONCE for all its items: a jsonb map {item id: rival habit id}
-- (p_item_habits). The old 3-arg shape keeps working through p_rival_habit_id, which answers the first proposed item.
-- One function with a default instead of an overload: overloads with defaults are ambiguous in PostgREST.
drop function if exists public.respond_challenge(uuid, boolean, uuid);
create or replace function public.respond_challenge(
  p_id uuid,
  p_accept boolean,
  p_rival_habit_id uuid default null,
  p_item_habits jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c public.challenges%rowtype;
  it public.challenge_items%rowtype;
  v_map jsonb;
  v_first uuid;
  v_text text;
  v_habit uuid;
  v_photo boolean;
  v_used uuid[] := '{}';
  v_key text;
  v_today date;
  v_start date;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into c from public.challenges where id = p_id for update;
  if not found then
    raise exception 'challenge_not_found';
  end if;
  if c.rival_id <> v_uid then
    raise exception 'not_rival';
  end if;
  if c.status <> 'proposed' then
    raise exception 'challenge_not_proposed';
  end if;

  if not p_accept then
    update public.challenge_items set status = 'declined' where challenge_id = p_id and status = 'proposed';
    update public.challenges set status = 'declined' where id = p_id;
    return;
  end if;

  if not exists (select 1 from public.challenge_items i where i.challenge_id = p_id and i.status = 'proposed') then
    raise exception 'challenge_not_proposed';
  end if;
  if exists (
    select 1 from public.challenge_items i
    where i.challenge_id = p_id and i.status = 'proposed'
      and not exists (select 1 from public.habits h where h.id = i.creator_habit_id and h.archived_at is null)
  ) then
    raise exception 'creator_habit_unavailable';
  end if;

  v_map := p_item_habits;
  if v_map is null and p_rival_habit_id is not null then
    select i.id into v_first
    from public.challenge_items i
    where i.challenge_id = p_id and i.status = 'proposed'
    order by i.position
    limit 1;
    v_map := jsonb_build_object(v_first::text, p_rival_habit_id::text);
  end if;
  if v_map is null or jsonb_typeof(v_map) <> 'object' or v_map = '{}'::jsonb then
    raise exception 'rival_habit_required';
  end if;

  for it in
    select * from public.challenge_items i where i.challenge_id = p_id and i.status = 'proposed' order by i.position
  loop
    v_text := v_map ->> it.id::text;
    if v_text is null then
      raise exception 'rival_habit_required';
    end if;
    if v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'rival_habit_invalid';
    end if;
    v_habit := v_text::uuid;
    select h.requires_photo into v_photo
    from public.habits h
    where h.id = v_habit
      and h.user_id = v_uid
      and h.archived_at is null
      and h.visibility <> 'private';
    if not found then
      raise exception 'rival_habit_invalid';
    end if;
    if it.requires_photo and not v_photo then
      raise exception 'rival_habit_needs_photo';
    end if;
    if v_habit = any (v_used) then
      raise exception 'rival_habit_duplicate';
    end if;
    v_used := v_used || v_habit;
  end loop;

  for v_key in select jsonb_object_keys(v_map) loop
    if not exists (
      select 1 from public.challenge_items i
      where i.challenge_id = p_id and i.status = 'proposed' and i.id::text = v_key
    ) then
      raise exception 'item_not_found';
    end if;
  end loop;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = c.creator_id and f.addressee_id = c.rival_id)
        or (f.requester_id = c.rival_id and f.addressee_id = c.creator_id))
  ) then
    raise exception 'not_friends';
  end if;

  v_today := (now() at time zone c.timezone)::date;
  v_start := case
    when c.frequency_type = 'daily' then v_today + 1
    else v_today + (8 - extract(isodow from v_today)::int)
  end;
  for it in
    select * from public.challenge_items i where i.challenge_id = p_id and i.status = 'proposed' order by i.position
  loop
    update public.challenge_items
    set rival_habit_id = (v_map ->> it.id::text)::uuid,
        status = 'active',
        starts_on = v_start,
        accepted_at = now()
    where id = it.id;
  end loop;
  update public.challenges set status = 'active', starts_on = v_start where id = p_id;
end;
$$;

-- ============================================================ f2. add_challenge_item
-- While the challenge is proposed only its creator adds (the rival answers all items in respond_challenge); once it is
-- active either player adds and the OTHER one answers. Columns are side-relative: creator_habit_id is the challenge
-- creator's habit whoever proposed the item. At most 5 live items.
create or replace function public.add_challenge_item(
  p_challenge_id uuid,
  p_habit_id uuid,
  p_target_per_week int default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c public.challenges%rowtype;
  v_photo boolean;
  v_is_creator boolean;
  v_pos int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into c from public.challenges where id = p_challenge_id for update;
  if not found or v_uid not in (c.creator_id, c.rival_id) then
    raise exception 'challenge_not_found';
  end if;
  if c.status = 'proposed' and v_uid <> c.creator_id then
    raise exception 'not_creator';
  end if;
  if c.status not in ('proposed', 'active') or c.cancel_requested_by is not null then
    raise exception 'challenge_not_open';
  end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = c.creator_id and f.addressee_id = c.rival_id)
        or (f.requester_id = c.rival_id and f.addressee_id = c.creator_id))
  ) then
    raise exception 'not_friends';
  end if;
  if (c.frequency_type = 'daily' and p_target_per_week is not null)
     or (c.frequency_type = 'weekly' and (p_target_per_week is null or p_target_per_week not between 1 and 7)) then
    raise exception 'invalid_target';
  end if;
  select h.requires_photo into v_photo
  from public.habits h
  where h.id = p_habit_id
    and h.user_id = v_uid
    and h.archived_at is null
    and h.visibility <> 'private';
  if not found then
    raise exception 'habit_invalid';
  end if;
  if (select count(*) from public.challenge_items i where i.challenge_id = c.id and i.status in ('proposed', 'active')) >= 5 then
    raise exception 'too_many_items';
  end if;
  v_is_creator := v_uid = c.creator_id;
  if exists (
    select 1 from public.challenge_items i
    where i.challenge_id = c.id and i.status in ('proposed', 'active')
      and ((v_is_creator and i.creator_habit_id = p_habit_id) or (not v_is_creator and i.rival_habit_id = p_habit_id))
  ) then
    raise exception 'habit_already_in_challenge';
  end if;
  if c.status = 'active' and public.next_item_start(c) is null then
    raise exception 'challenge_ending';
  end if;

  select coalesce(max(i.position), 0) + 1 into v_pos from public.challenge_items i where i.challenge_id = c.id;
  if v_pos > 50 then
    raise exception 'too_many_items';
  end if;
  insert into public.challenge_items (challenge_id, position, creator_habit_id, rival_habit_id, target_per_week,
                                      requires_photo, status, proposed_by)
  values (c.id, v_pos,
          case when v_is_creator then p_habit_id end,
          case when not v_is_creator then p_habit_id end,
          p_target_per_week, v_photo, 'proposed', v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================ f3. respond_challenge_item / withdraw_challenge_item
-- Only on an active challenge, only the non-proposer. Accepting fills the responder's side and starts the item at the
-- next period boundary (computed now, never mid-period). Both return the challenge id (the caller revalidates its page).
create or replace function public.respond_challenge_item(
  p_item_id uuid,
  p_accept boolean,
  p_habit_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cid uuid;
  c public.challenges%rowtype;
  it public.challenge_items%rowtype;
  v_photo boolean;
  v_is_creator boolean;
  v_start date;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select i.challenge_id into v_cid from public.challenge_items i where i.id = p_item_id;
  if not found then
    raise exception 'item_not_found';
  end if;
  select * into c from public.challenges where id = v_cid for update;
  if v_uid not in (c.creator_id, c.rival_id) then
    raise exception 'item_not_found';
  end if;
  select * into it from public.challenge_items where id = p_item_id for update;
  if c.status <> 'active' or c.cancel_requested_by is not null then
    raise exception 'challenge_not_active';
  end if;
  if it.proposed_by = v_uid then
    raise exception 'not_responder';
  end if;
  if it.status <> 'proposed' then
    raise exception 'item_not_proposed';
  end if;

  if not p_accept then
    update public.challenge_items set status = 'declined' where id = it.id;
    return c.id;
  end if;

  if p_habit_id is null then
    raise exception 'habit_required';
  end if;
  select h.requires_photo into v_photo
  from public.habits h
  where h.id = p_habit_id
    and h.user_id = v_uid
    and h.archived_at is null
    and h.visibility <> 'private';
  if not found then
    raise exception 'habit_invalid';
  end if;
  if it.requires_photo and not v_photo then
    raise exception 'habit_needs_photo';
  end if;
  v_is_creator := v_uid = c.creator_id;
  if not exists (
    select 1 from public.habits h
    where h.id = case when v_is_creator then it.rival_habit_id else it.creator_habit_id end and h.archived_at is null
  ) then
    raise exception 'proposer_habit_unavailable';
  end if;
  if exists (
    select 1 from public.challenge_items i
    where i.challenge_id = c.id and i.id <> it.id and i.status in ('proposed', 'active')
      and ((v_is_creator and i.creator_habit_id = p_habit_id) or (not v_is_creator and i.rival_habit_id = p_habit_id))
  ) then
    raise exception 'habit_already_in_challenge';
  end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = c.creator_id and f.addressee_id = c.rival_id)
        or (f.requester_id = c.rival_id and f.addressee_id = c.creator_id))
  ) then
    raise exception 'not_friends';
  end if;
  v_start := public.next_item_start(c);
  if v_start is null then
    raise exception 'challenge_ending';
  end if;

  update public.challenge_items
  set creator_habit_id = case when v_is_creator then p_habit_id else creator_habit_id end,
      rival_habit_id = case when v_is_creator then rival_habit_id else p_habit_id end,
      status = 'active',
      starts_on = v_start,
      accepted_at = now()
  where id = it.id;
  return c.id;
end;
$$;

create or replace function public.withdraw_challenge_item(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cid uuid;
  c public.challenges%rowtype;
  it public.challenge_items%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select i.challenge_id into v_cid from public.challenge_items i where i.id = p_item_id;
  if not found then
    raise exception 'item_not_found';
  end if;
  select * into c from public.challenges where id = v_cid for update;
  if v_uid not in (c.creator_id, c.rival_id) then
    raise exception 'item_not_found';
  end if;
  select * into it from public.challenge_items where id = p_item_id for update;
  if it.proposed_by <> v_uid then
    raise exception 'not_proposer';
  end if;
  if it.status <> 'proposed' then
    raise exception 'item_not_proposed';
  end if;
  -- a challenge always keeps at least one live item
  if c.status = 'proposed' and not exists (
    select 1 from public.challenge_items i
    where i.challenge_id = c.id and i.status = 'proposed' and i.id <> it.id
  ) then
    raise exception 'last_item';
  end if;
  update public.challenge_items set status = 'withdrawn' where id = it.id;
  return c.id;
end;
$$;

revoke execute on function public.respond_challenge(uuid, boolean, uuid, jsonb) from public, anon;
revoke execute on function public.add_challenge_item(uuid, uuid, int) from public, anon;
revoke execute on function public.respond_challenge_item(uuid, boolean, uuid) from public, anon;
revoke execute on function public.withdraw_challenge_item(uuid) from public, anon;
grant execute on function public.respond_challenge(uuid, boolean, uuid, jsonb) to authenticated;
grant execute on function public.add_challenge_item(uuid, uuid, int) to authenticated;
grant execute on function public.respond_challenge_item(uuid, boolean, uuid) to authenticated;
grant execute on function public.withdraw_challenge_item(uuid) to authenticated;
