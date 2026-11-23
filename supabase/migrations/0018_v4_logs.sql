-- v4 logs: time (with Pomodoro blocks), series and movies, quantity (a daily goal) and cardio
-- outings, as optional details of a check-in. Time, watch and cardio never create, change or
-- delete a check-in on their own; quantity is the one exception: its check-in is managed by the
-- server from the goal. Everything is private to the owner: no policy for friends, nothing for
-- anon, nothing in the public profile.

-- ============================================================ habits: types, presets, quantity
alter table public.habits drop constraint habits_log_type_check;
alter table public.habits add constraint habits_log_type_check
  check (log_type in ('none', 'reading', 'workout', 'time', 'watch', 'quantity', 'cardio'));
alter table public.habits drop constraint habits_preset_check;
alter table public.habits add constraint habits_preset_check
  check (preset in ('gym', 'water', 'study', 'read', 'walk', 'sleep', 'eat_well', 'watch', 'run'));

alter table public.habits
  add column quantity_unit text
    constraint habits_quantity_unit_check check (quantity_unit in ('ml', 'steps', 'km', 'times', 'minutes', 'custom')),
  add column quantity_label text
    constraint habits_quantity_label_len check (char_length(quantity_label) between 1 and 12),
  add column quantity_target numeric(10, 2)
    constraint habits_quantity_target_range check (quantity_target > 0 and quantity_target <= 100000),
  add column quantity_step numeric(10, 2)
    constraint habits_quantity_step_range check (quantity_step > 0),
  add column quantity_display text not null default 'base'
    constraint habits_quantity_display_check check (quantity_display in ('base', 'glasses')),
  add column glass_ml int not null default 250
    constraint habits_glass_ml_range check (glass_ml between 50 and 1000),
  -- a quantity habit has its unit, goal and step; any other type has none of them
  add constraint habits_quantity_shape check (
    (log_type = 'quantity') = (quantity_unit is not null and quantity_target is not null and quantity_step is not null)
  ),
  -- only the custom unit has a label, and it must have one
  add constraint habits_quantity_label_custom check (
    (quantity_unit is not distinct from 'custom') = (quantity_label is not null)
  ),
  -- whole numbers except for km and custom units
  add constraint habits_quantity_whole check (
    quantity_unit in ('km', 'custom')
    or ((quantity_target is null or quantity_target = trunc(quantity_target))
        and (quantity_step is null or quantity_step = trunc(quantity_step)))
  ),
  add constraint habits_quantity_step_le_target check (quantity_step is null or quantity_step <= quantity_target),
  -- glasses are a view of ml
  add constraint habits_quantity_glasses check (quantity_display = 'base' or quantity_unit is not distinct from 'ml');
grant insert (quantity_unit, quantity_label, quantity_target, quantity_step, quantity_display, glass_ml)
  on public.habits to authenticated;
grant update (quantity_unit, quantity_label, quantity_target, quantity_step, quantity_display, glass_ml)
  on public.habits to authenticated;

-- Time and quantity never take a photo (Pomodoro and the goal create the check-in by themselves).
-- A trigger, not a check, so the error keeps the `photo_conflict` code of 0005.
create function public.habits_log_photo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.requires_photo and new.log_type in ('quantity', 'time') then
    raise exception 'photo_conflict';
  end if;
  return new;
end;
$$;
revoke execute on function public.habits_log_photo() from public, anon, authenticated;
create trigger habits_log_photo
  before insert or update of requires_photo, log_type on public.habits
  for each row execute function public.habits_log_photo();

-- Steps and a detailed log never go together: a habit with active steps cannot take a log type
-- (check_item would complete its day without the goal). The item side is habit_items_activation_guard.
create function public.habits_log_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.log_type <> 'none' and new.log_type is distinct from old.log_type and exists (
    select 1 from public.habit_items i where i.habit_id = new.id and i.archived_at is null
  ) then
    raise exception 'items_with_log';
  end if;
  return new;
end;
$$;
revoke execute on function public.habits_log_items_guard() from public, anon, authenticated;
create trigger habits_log_items_guard
  before update of log_type on public.habits
  for each row execute function public.habits_log_items_guard();

-- Palette keys of the new presets (same keys as src/domain/habit-colors.ts). Same signature,
-- volatility and grants as 0013.
create or replace function public.habit_preset_color(p_preset text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_preset
    when 'gym' then 'durazno'
    when 'water' then 'cielo'
    when 'study' then 'lavanda'
    when 'read' then 'arena'
    when 'walk' then 'salvia'
    when 'sleep' then 'indigo'
    when 'eat_well' then 'oliva'
    when 'watch' then 'rosa'
    when 'run' then 'durazno'
    else 'indigo'
  end
$$;

-- Existing Estudiar habits log time (it does not change how their day is completed). Agua and
-- Caminar are not converted: that would change how their day is completed.
update public.habits set log_type = 'time'
where preset = 'study' and log_type = 'none' and not requires_photo
  and not exists (select 1 from public.habit_items i where i.habit_id = habits.id and i.archived_at is null);

-- ============================================================ habit_items: no steps with a detailed log
create or replace function public.habit_items_activation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requires_photo boolean;
  v_log_type text;
begin
  if new.archived_at is null and (tg_op = 'INSERT' or old.archived_at is not null) then
    select h.requires_photo, h.log_type into v_requires_photo, v_log_type
    from public.habits h
    where h.id = new.habit_id
    for update;
    if v_requires_photo then
      raise exception 'photo_conflict';
    end if;
    if v_log_type <> 'none' then
      raise exception 'items_with_log';
    end if;
    if (
      select count(*) from public.habit_items i
      where i.habit_id = new.habit_id and i.archived_at is null and i.id <> new.id
    ) >= 12 then
      raise exception 'too_many_items';
    end if;
  end if;
  return null;
end;
$$;

-- ============================================================ steps never move a quantity habit's check-in
-- complete_day_from_items is 0014's plus `log_type <> 'quantity'`; uncheck_item is 0005's plus the
-- same refusal (an archived step of a habit that later became quantity could delete its check-in).
create or replace function public.complete_day_from_items(p_habit_id uuid, p_user_id uuid, p_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_checked int;
begin
  if not exists (
    select 1 from public.habits h
    where h.id = p_habit_id and h.user_id = p_user_id
      and h.archived_at is null and not h.requires_photo and h.log_type <> 'quantity'
  ) then
    return false;
  end if;

  select count(*)::int into v_total
  from public.habit_items i
  where i.habit_id = p_habit_id and i.archived_at is null;

  select count(*)::int into v_checked
  from public.habit_items i
  join public.checkin_items ci on ci.item_id = i.id and ci.local_date = p_date
  where i.habit_id = p_habit_id and i.archived_at is null;

  if v_total = 0 or v_checked < v_total then
    return false;
  end if;

  insert into public.checkins (habit_id, user_id, local_date)
  values (p_habit_id, p_user_id, p_date)
  on conflict (habit_id, local_date) do nothing;
  return true;
end;
$$;

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

  delete from public.checkin_items ci
  where ci.item_id = p_item_id and ci.local_date = v_date and ci.user_id = v_uid;
  delete from public.checkins c
  where c.habit_id = v_habit and c.local_date = v_date and c.user_id = v_uid
    and c.rejected_at is null;
end;
$$;

-- ============================================================ create_checkin: not for quantity habits
-- 0005 plus one line: the check-in of a quantity habit is only created by its goal.
create or replace function public.create_checkin(p_habit_id uuid)
returns table (checkin_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_requires_photo boolean;
  v_log_type text;
  v_date date;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.timezone into v_tz from public.profiles p
  where p.id = v_uid and p.deleted_at is null;
  if not found then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select h.requires_photo, h.log_type into v_requires_photo, v_log_type
  from public.habits h
  where h.id = p_habit_id and h.user_id = v_uid and h.archived_at is null;
  if not found then
    raise exception 'habit_not_found';
  end if;
  if v_log_type = 'quantity' then
    raise exception 'quantity_habit';
  end if;
  if exists (
    select 1 from public.habit_items i
    where i.habit_id = p_habit_id and i.archived_at is null
  ) then
    raise exception 'habit_has_items';
  end if;
  if v_requires_photo then
    raise exception 'photo_required';
  end if;

  v_date := (now() at time zone v_tz)::date;

  insert into public.checkins as c (habit_id, user_id, local_date)
  values (p_habit_id, v_uid, v_date)
  on conflict (habit_id, local_date) do nothing
  returning c.id into v_id;

  if v_id is not null then
    return query select v_id, true;
  else
    return query
      select c.id, false from public.checkins c
      where c.habit_id = p_habit_id and c.local_date = v_date;
  end if;
end;
$$;

-- ============================================================ tables
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  habit_id uuid not null references public.habits (id) on delete cascade,
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  local_date date not null,
  minutes int not null check (minutes between 1 and 1440),
  topic text check (topic is null or char_length(topic) between 1 and 60),
  pomodoros smallint not null default 0 check (pomodoros between 0 and 288),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_checkin_key unique (checkin_id)
);
create index time_entries_user_date_idx on public.time_entries (user_id, local_date);

-- The receipt of a Pomodoro block (the id is made by the client). It outlives the check-in so a
-- late retry of an undone day does not mark the day again.
create table public.pomodoro_blocks (
  block_id uuid primary key,
  user_id uuid not null references public.profiles (id),
  habit_id uuid not null references public.habits (id) on delete cascade,
  checkin_id uuid references public.checkins (id) on delete set null,
  local_date date not null,
  minutes smallint not null check (minutes between 1 and 90),
  created_at timestamptz not null default now()
);
create index pomodoro_blocks_user_date_idx on public.pomodoro_blocks (user_id, local_date);
create index pomodoro_blocks_user_created_idx on public.pomodoro_blocks (user_id, created_at);
-- the `on delete set null` of every check-in delete looks receipts up by checkin_id
create index pomodoro_blocks_checkin_idx on public.pomodoro_blocks (checkin_id) where checkin_id is not null;

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 120),
  kind text not null check (kind in ('series', 'movie')),
  total_seasons smallint check (total_seasons is null or total_seasons between 1 and 100),
  total_episodes int check (total_episodes is null or total_episodes between 1 and 5000),
  runtime_min int check (runtime_min is null or runtime_min between 1 and 600),
  status text not null default 'watching' check (status in ('watching', 'finished')),
  finished_on date check (finished_on is null or finished_on >= date '1900-01-01'),
  created_at timestamptz not null default now(),
  constraint media_items_finished_consistent check ((status = 'finished') = (finished_on is not null)),
  constraint media_items_kind_shape check (
    (kind = 'movie' and total_seasons is null and total_episodes is null)
    or (kind = 'series' and runtime_min is null)
  )
);
create index media_items_user_idx on public.media_items (user_id);

-- A title is never finished in the future of its owner (their local date), nor before 1900.
create function public.media_items_finished_on_guard()
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
revoke execute on function public.media_items_finished_on_guard() from public, anon, authenticated;
create trigger media_items_finished_on_guard
  before insert or update of finished_on on public.media_items
  for each row execute function public.media_items_finished_on_guard();

create table public.watch_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  habit_id uuid not null references public.habits (id),
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  media_id uuid not null references public.media_items (id) on delete cascade,
  local_date date not null,
  episodes smallint check (episodes is null or episodes between 1 and 200),
  season smallint check (season is null or season between 1 and 100),
  episode_to smallint check (episode_to is null or episode_to between 1 and 5000),
  minutes int check (minutes is null or minutes between 1 and 1440),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watch_entries_checkin_key unique (checkin_id),
  -- a series is never "completed" (it finishes on the title) and a movie has no episodes
  constraint watch_entries_shape check (
    (episodes is not null and not completed) or (episodes is null and season is null and episode_to is null
      and (minutes is not null or completed))
  )
);
create index watch_entries_user_date_idx on public.watch_entries (user_id, local_date);
create index watch_entries_media_idx on public.watch_entries (media_id);

-- the amount is in the base unit (ml for water); no check-in: sums exist before the goal is met
create table public.quantity_entries (
  id uuid primary key,
  user_id uuid not null references public.profiles (id),
  habit_id uuid not null references public.habits (id) on delete cascade,
  local_date date not null,
  amount numeric(10, 2) not null check (amount > 0 and amount <= 100000),
  created_at timestamptz not null default now()
);
create index quantity_entries_user_date_idx on public.quantity_entries (user_id, local_date);
create index quantity_entries_habit_date_idx on public.quantity_entries (habit_id, local_date);

create table public.cardio_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  habit_id uuid not null references public.habits (id),
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('run', 'walk', 'bike', 'swim', 'other')),
  distance_m int not null check (distance_m between 1 and 500000),
  duration_s int not null check (duration_s between 1 and 86400),
  effort smallint check (effort is null or effort between 1 and 5),
  note text check (note is null or char_length(note) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cardio_entries_user_date_idx on public.cardio_entries (user_id, local_date);
create index cardio_entries_checkin_idx on public.cardio_entries (checkin_id);

-- ============================================================ RLS and grants
alter table public.time_entries enable row level security;
alter table public.pomodoro_blocks enable row level security;
alter table public.media_items enable row level security;
alter table public.watch_entries enable row level security;
alter table public.quantity_entries enable row level security;
alter table public.cardio_entries enable row level security;

create policy time_entries_select_owner on public.time_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy watch_entries_select_owner on public.watch_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy quantity_entries_select_owner on public.quantity_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy cardio_entries_select_owner on public.cardio_entries
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.time_entries, public.watch_entries, public.quantity_entries, public.cardio_entries
  to authenticated;
-- pomodoro_blocks: RPC only, no policy and no grant for clients

create policy media_items_select_owner on public.media_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy media_items_insert_owner on public.media_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy media_items_update_owner on public.media_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy media_items_delete_owner on public.media_items
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.media_items to authenticated;
grant insert (user_id, title, kind, total_seasons, total_episodes, runtime_min) on public.media_items to authenticated;
-- the kind of a title never changes
grant update (title, total_seasons, total_episodes, runtime_min, status, finished_on) on public.media_items to authenticated;

-- a deleted account keeps a valid JWT for a while: refuse writes made in its name
do $$
declare
  t text;
begin
  foreach t in array array[
    'time_entries', 'pomodoro_blocks', 'media_items', 'watch_entries', 'quantity_entries', 'cardio_entries'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I '
      'for each statement execute function public.forbid_deleted_actor()',
      t || '_forbid_deleted_actor', t);
  end loop;
end;
$$;

-- ============================================================ quantity: habit guards
-- With a proposed or active challenge on the habit: the goal cannot go down, the unit and label
-- cannot change, the type cannot leave quantity. Raising the goal and changing the view, the
-- glass or the step are fine (the goal is stored in the base unit).
create function public.habits_quantity_guard()
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
    select 1 from public.challenges c
    where c.status in ('proposed', 'active')
      and (c.creator_habit_id = new.id or c.rival_habit_id = new.id)
  ) then
    raise exception 'habit_in_challenge';
  end if;
  return new;
end;
$$;
revoke execute on function public.habits_quantity_guard() from public, anon, authenticated;
create trigger habits_quantity_guard
  before update of log_type, quantity_unit, quantity_label, quantity_target on public.habits
  for each row execute function public.habits_quantity_guard();

-- A new goal at or under today's total completes today. Changing the goal never deletes a check-in.
create function public.habits_quantity_reeval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_total numeric;
begin
  if new.log_type = 'quantity' and new.archived_at is null
     and new.quantity_target is distinct from old.quantity_target then
    select (pg_catalog.now() at time zone p.timezone)::date into v_today
    from public.profiles p where p.id = new.user_id;
    select coalesce(sum(e.amount), 0) into v_total
    from public.quantity_entries e where e.habit_id = new.id and e.local_date = v_today;
    if v_total > 0 and v_total >= new.quantity_target then
      insert into public.checkins (habit_id, user_id, local_date)
      values (new.id, new.user_id, v_today)
      on conflict (habit_id, local_date) do nothing;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.habits_quantity_reeval() from public, anon, authenticated;
create trigger habits_quantity_reeval
  after update of quantity_target on public.habits
  for each row execute function public.habits_quantity_reeval();

-- A client cannot delete the check-in of a quantity habit: only the goal (remove_quantity_entry)
-- and the service role (account deletion) do. SECURITY INVOKER on purpose: inside a definer RPC
-- current_user is the function owner, for a direct client delete it is `authenticated`.
create function public.checkins_quantity_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and current_user in ('authenticated', 'anon') and exists (
    select 1 from public.habits h where h.id = old.habit_id and h.log_type = 'quantity'
  ) then
    raise exception 'quantity_checkin_managed';
  end if;
  return old;
end;
$$;
revoke execute on function public.checkins_quantity_guard() from public, anon, authenticated;
create trigger checkins_quantity_guard
  before delete on public.checkins
  for each row execute function public.checkins_quantity_guard();

-- ============================================================ helpers (not callable by clients)
-- The caller (alive) and today in their own zone.
create function public.v4_actor()
returns table (uid uuid, today date)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_tz text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select p.timezone into v_tz from public.profiles p where p.id = v_uid and p.deleted_at is null;
  if not found then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return query select v_uid, (pg_catalog.now() at time zone v_tz)::date;
end;
$$;
revoke execute on function public.v4_actor() from public, anon, authenticated;

-- blank becomes null; more than 60 characters is invalid
create function public.v4_topic(p_topic text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(pg_catalog.btrim(p_topic), '');
begin
  if v is not null and char_length(v) > 60 then
    raise exception 'invalid_topic';
  end if;
  return v;
end;
$$;
revoke execute on function public.v4_topic(text) from public, anon, authenticated;

create function public.v4_cardio_check(p_kind text, p_distance_m int, p_duration_s int, p_effort int, p_note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(pg_catalog.btrim(p_note), '');
begin
  if p_kind is null or p_kind not in ('run', 'walk', 'bike', 'swim', 'other')
     or p_distance_m is null or p_distance_m < 1 or p_distance_m > 500000
     or p_duration_s is null or p_duration_s < 1 or p_duration_s > 86400
     or (p_effort is not null and (p_effort < 1 or p_effort > 5))
     or (v is not null and char_length(v) > 60) then
    raise exception 'invalid_cardio';
  end if;
  return v;
end;
$$;
revoke execute on function public.v4_cardio_check(text, int, int, int, text) from public, anon, authenticated;

-- ============================================================ RPCs: time
create function public.add_time(p_habit_id uuid, p_minutes int, p_topic text default null)
returns table (checkin_id uuid, total_minutes int, checkin_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_today date;
  v_type text;
  v_topic text;
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
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    raise exception 'invalid_minutes';
  end if;
  v_topic := public.v4_topic(p_topic);

  select c.checkin_id, c.created into v_cid, v_created from public.create_checkin(p_habit_id) c;

  insert into public.time_entries as t (user_id, habit_id, checkin_id, local_date, minutes, topic)
  values (v_uid, p_habit_id, v_cid, v_today, p_minutes, v_topic)
  on conflict on constraint time_entries_checkin_key do update
    set minutes = t.minutes + excluded.minutes,
        topic = coalesce(excluded.topic, t.topic),
        updated_at = pg_catalog.now()
    where t.minutes + excluded.minutes <= 1440
  returning t.minutes into v_total;
  if v_total is null then
    raise exception 'minutes_over_day';
  end if;

  return query select v_cid, v_total, v_created;
end;
$$;

-- Idempotent by block id: the receipt is written first; a block that already has one credits
-- nothing and does not touch the check-in.
create function public.add_pomodoro_block(p_habit_id uuid, p_block_id uuid, p_minutes int, p_topic text default null)
returns table (checkin_id uuid, total_minutes int, credited boolean, checkin_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_today date;
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

-- Fixes the total of a day (editing from the calendar or the habit). Keeps the pomodoros.
create function public.set_time_entry(p_checkin_id uuid, p_minutes int, p_topic text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_date date;
  v_habit uuid;
  v_type text;
  v_archived timestamptz;
  v_topic text;
  v_id uuid;
begin
  select a.uid, a.today into v_uid, v_today from public.v4_actor() a;

  select c.local_date, c.habit_id, h.log_type, h.archived_at into v_date, v_habit, v_type, v_archived
  from public.checkins c
  join public.habits h on h.id = c.habit_id
  where c.id = p_checkin_id and c.user_id = v_uid;
  if not found then
    raise exception 'checkin_not_found';
  end if;
  if v_type <> 'time' then
    raise exception 'log_type_mismatch';
  end if;
  if v_archived is not null then
    raise exception 'habit_not_found';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    raise exception 'invalid_minutes';
  end if;
  v_topic := public.v4_topic(p_topic);

  insert into public.time_entries as t (user_id, habit_id, checkin_id, local_date, minutes, topic)
  values (v_uid, v_habit, p_checkin_id, v_date, p_minutes, v_topic)
  on conflict on constraint time_entries_checkin_key do update
    set minutes = excluded.minutes, topic = excluded.topic, updated_at = pg_catalog.now()
  returning t.id into v_id;
  return v_id;
end;
$$;

-- Deletes are permissive on purpose (the brief lists no error for them): an unknown id or an
-- archived habit deletes nothing and raises nothing; only the caller's own rows can match.
create function public.delete_time_entry(p_checkin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  select a.uid into v_uid from public.v4_actor() a;
  delete from public.time_entries t where t.checkin_id = p_checkin_id and t.user_id = v_uid;
end;
$$;

-- ============================================================ RPCs: series and movies
create function public.save_watch_entry(
  p_checkin_id uuid, p_media_id uuid, p_episodes int, p_season int, p_episode_to int, p_minutes int,
  p_completed boolean, p_finished boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_date date;
  v_habit uuid;
  v_type text;
  v_archived timestamptz;
  v_kind text;
  v_seasons smallint;
  v_completed boolean := coalesce(p_completed, false);
  v_id uuid;
begin
  select a.uid, a.today into v_uid, v_today from public.v4_actor() a;

  select c.local_date, c.habit_id, h.log_type, h.archived_at into v_date, v_habit, v_type, v_archived
  from public.checkins c
  join public.habits h on h.id = c.habit_id
  where c.id = p_checkin_id and c.user_id = v_uid;
  if not found then
    raise exception 'checkin_not_found';
  end if;
  if v_type <> 'watch' then
    raise exception 'log_type_mismatch';
  end if;
  if v_archived is not null then
    raise exception 'habit_not_found';
  end if;

  select m.kind, m.total_seasons into v_kind, v_seasons
  from public.media_items m
  where m.id = p_media_id and m.user_id = v_uid;
  if not found then
    raise exception 'media_not_found';
  end if;

  if p_minutes is not null and (p_minutes < 1 or p_minutes > 1440) then
    raise exception 'invalid_watch';
  end if;
  if v_kind = 'series' then
    if p_episodes is null or p_episodes < 1 or p_episodes > 200 or v_completed
       or (p_season is not null and (p_season < 1 or p_season > 100 or (v_seasons is not null and p_season > v_seasons)))
       or (p_episode_to is not null and (p_episode_to < 1 or p_episode_to > 5000)) then
      raise exception 'invalid_watch';
    end if;
  else
    if p_episodes is not null or p_season is not null or p_episode_to is not null
       or (p_minutes is null and not v_completed) then
      raise exception 'invalid_watch';
    end if;
  end if;

  insert into public.watch_entries as w (user_id, habit_id, checkin_id, media_id, local_date, episodes, season, episode_to, minutes, completed)
  values (v_uid, v_habit, p_checkin_id, p_media_id, v_date, p_episodes, p_season, p_episode_to, p_minutes, v_completed)
  on conflict on constraint watch_entries_checkin_key do update
    set media_id = excluded.media_id,
        episodes = excluded.episodes,
        season = excluded.season,
        episode_to = excluded.episode_to,
        minutes = excluded.minutes,
        completed = excluded.completed,
        updated_at = pg_catalog.now()
  returning w.id into v_id;

  -- A completed movie (or a finished series) always stamps finished_on with the date of THIS
  -- check-in, even if the title was already finished: the latest entry wins. Deleting an entry
  -- never reverts the title to "watching".
  if (v_kind = 'movie' and v_completed) or (v_kind = 'series' and coalesce(p_finished, false)) then
    update public.media_items m set status = 'finished', finished_on = v_date
    where m.id = p_media_id and m.user_id = v_uid;
  end if;
  return v_id;
end;
$$;

-- Permissive on purpose, like delete_time_entry: nothing to delete is not an error.
create function public.delete_watch_entry(p_checkin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  select a.uid into v_uid from public.v4_actor() a;
  delete from public.watch_entries w where w.checkin_id = p_checkin_id and w.user_id = v_uid;
end;
$$;

-- ============================================================ RPCs: quantity
-- Idempotent by entry id. The habit row is locked so two sums cannot both miss the goal.
create function public.add_quantity_entry(p_habit_id uuid, p_entry_id uuid, p_amount numeric)
returns table (total numeric, target numeric, done boolean, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_today date;
  v_type text;
  v_unit text;
  v_target numeric;
  v_inserted uuid;
  v_owner uuid;
  v_entry_habit uuid;
  v_total numeric;
begin
  select a.uid, a.today into v_uid, v_today from public.v4_actor() a;

  select h.log_type, h.quantity_unit, h.quantity_target into v_type, v_unit, v_target
  from public.habits h
  where h.id = p_habit_id and h.user_id = v_uid and h.archived_at is null
  for update;
  if not found then
    raise exception 'habit_not_found';
  end if;
  if v_type <> 'quantity' then
    raise exception 'log_type_mismatch';
  end if;
  if p_entry_id is null then
    raise exception 'invalid_entry';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000
     or p_amount <> pg_catalog.round(p_amount, 2)
     or (v_unit not in ('km', 'custom') and p_amount <> pg_catalog.trunc(p_amount)) then
    raise exception 'invalid_amount';
  end if;

  insert into public.quantity_entries as e (id, user_id, habit_id, local_date, amount)
  values (p_entry_id, v_uid, p_habit_id, v_today, p_amount)
  on conflict (id) do nothing
  returning e.id into v_inserted;
  if v_inserted is null then
    select e.user_id, e.habit_id into v_owner, v_entry_habit from public.quantity_entries e where e.id = p_entry_id;
    if v_owner is distinct from v_uid or v_entry_habit is distinct from p_habit_id then
      raise exception 'invalid_entry';
    end if;
  end if;

  select coalesce(sum(e.amount), 0) into v_total
  from public.quantity_entries e where e.habit_id = p_habit_id and e.local_date = v_today;
  if v_total > 100000 then
    raise exception 'amount_over_day';
  end if;

  if v_total >= v_target then
    insert into public.checkins (habit_id, user_id, local_date)
    values (p_habit_id, v_uid, v_today)
    on conflict (habit_id, local_date) do nothing;
  end if;

  return query select v_total, v_target, exists (
    select 1 from public.checkins c where c.habit_id = p_habit_id and c.local_date = v_today
  ), v_inserted is not null;
end;
$$;

create function public.remove_quantity_entry(p_entry_id uuid)
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
  if v_total < v_target and not exists (
    select 1
    from public.challenges ch
    join public.challenge_periods cp on cp.challenge_id = ch.id
    where (ch.creator_habit_id = v_habit or ch.rival_habit_id = v_habit)
      and cp.closed_at is not null
      and v_today between cp.period_start and cp.period_end
  ) then
    delete from public.checkins c where c.habit_id = v_habit and c.local_date = v_today;
  end if;

  return query select v_total, v_target, exists (
    select 1 from public.checkins c where c.habit_id = v_habit and c.local_date = v_today
  );
end;
$$;

-- ============================================================ RPCs: cardio
create function public.add_cardio_entry(
  p_checkin_id uuid, p_kind text, p_distance_m int, p_duration_s int, p_effort int default null, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_date date;
  v_habit uuid;
  v_type text;
  v_archived timestamptz;
  v_note text;
  v_id uuid;
begin
  select a.uid, a.today into v_uid, v_today from public.v4_actor() a;

  -- the check-in row is locked so two outings cannot both pass the cap of ten
  select c.local_date, c.habit_id, h.log_type, h.archived_at into v_date, v_habit, v_type, v_archived
  from public.checkins c
  join public.habits h on h.id = c.habit_id
  where c.id = p_checkin_id and c.user_id = v_uid
  for update of c;
  if not found then
    raise exception 'checkin_not_found';
  end if;
  if v_type <> 'cardio' then
    raise exception 'log_type_mismatch';
  end if;
  if v_archived is not null then
    raise exception 'habit_not_found';
  end if;
  v_note := public.v4_cardio_check(p_kind, p_distance_m, p_duration_s, p_effort, p_note);
  if (select count(*) from public.cardio_entries e where e.checkin_id = p_checkin_id) >= 10 then
    raise exception 'too_many_entries';
  end if;

  insert into public.cardio_entries as e (user_id, habit_id, checkin_id, local_date, kind, distance_m, duration_s, effort, note)
  values (v_uid, v_habit, p_checkin_id, v_date, p_kind, p_distance_m, p_duration_s, p_effort, v_note)
  returning e.id into v_id;
  return v_id;
end;
$$;

create function public.update_cardio_entry(
  p_entry_id uuid, p_kind text, p_distance_m int, p_duration_s int, p_effort int default null, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_archived timestamptz;
  v_note text;
begin
  select a.uid, a.today into v_uid, v_today from public.v4_actor() a;

  select h.archived_at into v_archived
  from public.cardio_entries e
  join public.habits h on h.id = e.habit_id
  where e.id = p_entry_id and e.user_id = v_uid;
  if not found then
    raise exception 'entry_not_found';
  end if;
  if v_archived is not null then
    raise exception 'habit_not_found';
  end if;
  v_note := public.v4_cardio_check(p_kind, p_distance_m, p_duration_s, p_effort, p_note);

  update public.cardio_entries e
  set kind = p_kind, distance_m = p_distance_m, duration_s = p_duration_s, effort = p_effort, note = v_note,
      updated_at = pg_catalog.now()
  where e.id = p_entry_id and e.user_id = v_uid;
end;
$$;

-- Permissive on purpose, like delete_time_entry: an unknown id deletes nothing and raises nothing.
create function public.delete_cardio_entry(p_entry_id uuid)
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
end;
$$;

-- ============================================================ execute grants
revoke execute on function public.add_time(uuid, int, text) from public, anon;
revoke execute on function public.add_pomodoro_block(uuid, uuid, int, text) from public, anon;
revoke execute on function public.set_time_entry(uuid, int, text) from public, anon;
revoke execute on function public.delete_time_entry(uuid) from public, anon;
revoke execute on function public.save_watch_entry(uuid, uuid, int, int, int, int, boolean, boolean) from public, anon;
revoke execute on function public.delete_watch_entry(uuid) from public, anon;
revoke execute on function public.add_quantity_entry(uuid, uuid, numeric) from public, anon;
revoke execute on function public.remove_quantity_entry(uuid) from public, anon;
revoke execute on function public.add_cardio_entry(uuid, text, int, int, int, text) from public, anon;
revoke execute on function public.update_cardio_entry(uuid, text, int, int, int, text) from public, anon;
revoke execute on function public.delete_cardio_entry(uuid) from public, anon;
grant execute on function public.add_time(uuid, int, text) to authenticated;
grant execute on function public.add_pomodoro_block(uuid, uuid, int, text) to authenticated;
grant execute on function public.set_time_entry(uuid, int, text) to authenticated;
grant execute on function public.delete_time_entry(uuid) to authenticated;
grant execute on function public.save_watch_entry(uuid, uuid, int, int, int, int, boolean, boolean) to authenticated;
grant execute on function public.delete_watch_entry(uuid) to authenticated;
grant execute on function public.add_quantity_entry(uuid, uuid, numeric) to authenticated;
grant execute on function public.remove_quantity_entry(uuid) to authenticated;
grant execute on function public.add_cardio_entry(uuid, text, int, int, int, text) to authenticated;
grant execute on function public.update_cardio_entry(uuid, text, int, int, int, text) to authenticated;
grant execute on function public.delete_cardio_entry(uuid) to authenticated;
