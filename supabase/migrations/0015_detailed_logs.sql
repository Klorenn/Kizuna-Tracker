-- Detailed logs (v3): what you read and what you trained, as an optional detail of a check-in.
-- A log never creates, changes or deletes a check-in; deleting a check-in (the undo of Hoy)
-- deletes its log. Everything here is private to the owner: no policy for friends, nothing for
-- anon, nothing in the public profile.
-- Also in this migration (owner addendum): private body weight entries and height.

-- ============================================================ habits.log_type
alter table public.habits
  add column log_type text not null default 'none'
    constraint habits_log_type_check check (log_type in ('none', 'reading', 'workout'));
update public.habits set log_type = 'reading' where preset = 'read';
update public.habits set log_type = 'workout' where preset = 'gym';
grant insert (log_type) on public.habits to authenticated;
grant update (log_type) on public.habits to authenticated;

-- ============================================================ books
create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 120),
  author text check (author is null or char_length(author) between 1 and 80),
  total_pages int check (total_pages is null or total_pages between 1 and 20000),
  status text not null default 'reading' check (status in ('reading', 'finished')),
  finished_on date,
  created_at timestamptz not null default now(),
  constraint books_finished_consistent check ((status = 'finished') = (finished_on is not null))
);
create index books_user_idx on public.books (user_id);

-- A book is never finished in the future of its owner (their local date, like every date here).
create function public.books_finished_on_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.finished_on is not null and new.finished_on > (
    pg_catalog.now() at time zone (select p.timezone from public.profiles p where p.id = new.user_id)
  )::date then
    raise exception 'invalid_finished_on' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.books_finished_on_guard() from public, anon, authenticated;
create trigger books_finished_on_guard
  before insert or update of finished_on on public.books
  for each row execute function public.books_finished_on_guard();

alter table public.books enable row level security;
create policy books_select_owner on public.books
  for select to authenticated using (user_id = (select auth.uid()));
create policy books_insert_owner on public.books
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy books_update_owner on public.books
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy books_delete_owner on public.books
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.books to authenticated;
grant insert (user_id, title, author, total_pages) on public.books to authenticated;
grant update (title, author, total_pages, status, finished_on) on public.books to authenticated;

-- ============================================================ exercises
-- user_id null = catalog (stable `key`, seeded below); otherwise the exercise of one user.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  key text,
  name text not null check (char_length(name) between 1 and 60),
  muscle_group text not null check (muscle_group in ('legs', 'chest', 'back', 'shoulders', 'arms', 'core')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint exercises_key_only_catalog check ((user_id is null) = (key is not null))
);
create unique index exercises_key on public.exercises (key) where key is not null;
create unique index exercises_user_name on public.exercises (user_id, lower(name))
  where user_id is not null and archived_at is null;
create index exercises_user_idx on public.exercises (user_id);

insert into public.exercises (key, name, muscle_group) values
  ('squat', 'Sentadilla', 'legs'),
  ('leg_press', 'Prensa', 'legs'),
  ('romanian_deadlift', 'Peso muerto rumano', 'legs'),
  ('lunge', 'Zancadas', 'legs'),
  ('leg_extension', 'Extensión de cuádriceps', 'legs'),
  ('leg_curl', 'Curl femoral', 'legs'),
  ('calf_raise', 'Elevación de talones', 'legs'),
  ('bench_press', 'Press banca', 'chest'),
  ('incline_db_press', 'Press inclinado con mancuernas', 'chest'),
  ('chest_fly', 'Aperturas', 'chest'),
  ('dips', 'Fondos', 'chest'),
  ('push_up', 'Flexiones', 'chest'),
  ('pull_up', 'Dominadas', 'back'),
  ('barbell_row', 'Remo con barra', 'back'),
  ('lat_pulldown', 'Jalón al pecho', 'back'),
  ('seated_row', 'Remo en polea baja', 'back'),
  ('deadlift', 'Peso muerto', 'back'),
  ('overhead_press', 'Press militar', 'shoulders'),
  ('lateral_raise', 'Elevaciones laterales', 'shoulders'),
  ('rear_delt_fly', 'Pájaros', 'shoulders'),
  ('face_pull', 'Face pull', 'shoulders'),
  ('barbell_curl', 'Curl con barra', 'arms'),
  ('db_curl', 'Curl con mancuernas', 'arms'),
  ('hammer_curl', 'Curl martillo', 'arms'),
  ('triceps_pushdown', 'Extensión de tríceps en polea', 'arms'),
  ('skull_crusher', 'Press francés', 'arms'),
  ('cable_crunch', 'Crunch en polea', 'core'),
  ('hanging_leg_raise', 'Elevación de piernas colgado', 'core'),
  ('ab_wheel', 'Rueda abdominal', 'core'),
  ('russian_twist', 'Giro ruso', 'core');

alter table public.exercises enable row level security;
create policy exercises_select on public.exercises
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy exercises_insert_owner on public.exercises
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy exercises_update_owner on public.exercises
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select on public.exercises to authenticated;
-- the muscle group is fixed at creation; the catalog is not insertable (user_id must be the caller)
grant insert (user_id, name, muscle_group) on public.exercises to authenticated;
grant update (name, archived_at) on public.exercises to authenticated;

-- ============================================================ reading_entries (RPC only)
create table public.reading_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  habit_id uuid not null references public.habits (id),
  checkin_id uuid not null unique references public.checkins (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  local_date date not null,
  from_page int not null,
  to_page int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reading_entries_pages check (from_page >= 0 and to_page >= from_page and to_page <= 20000)
);
create index reading_entries_user_date_idx on public.reading_entries (user_id, local_date);
create index reading_entries_book_idx on public.reading_entries (book_id);

alter table public.reading_entries enable row level security;
create policy reading_entries_select_owner on public.reading_entries
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.reading_entries to authenticated;

-- ============================================================ workout_sessions / workout_sets (RPC only)
-- non-empty, no repeats, only known day types
create function public.workout_day_types_valid(p_day_types text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    cardinality(p_day_types) between 1 and 8
    and array_position(p_day_types, null) is null
    and p_day_types <@ array['legs', 'chest', 'back', 'shoulders', 'arms', 'core', 'cardio', 'full_body']
    and cardinality(p_day_types) = (select count(distinct d) from unnest(p_day_types) d),
    false
  )
$$;
revoke execute on function public.workout_day_types_valid(text[]) from public, anon, authenticated;

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  habit_id uuid not null references public.habits (id),
  checkin_id uuid not null unique references public.checkins (id) on delete cascade,
  local_date date not null,
  day_types text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_day_types check (public.workout_day_types_valid(day_types))
);
create index workout_sessions_user_date_idx on public.workout_sessions (user_id, local_date);

-- user_id and local_date are copied from the session so stats read by range without a join
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  local_date date not null,
  exercise_id uuid not null references public.exercises (id),
  position smallint not null,
  reps int not null check (reps between 1 and 1000),
  weight_kg numeric(6, 2) not null check (weight_kg between 0 and 999.99)
);
create index workout_sets_user_date_idx on public.workout_sets (user_id, local_date);
create index workout_sets_session_idx on public.workout_sets (session_id);
create index workout_sets_exercise_idx on public.workout_sets (exercise_id);

alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
create policy workout_sessions_select_owner on public.workout_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy workout_sets_select_owner on public.workout_sets
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.workout_sessions to authenticated;
grant select on public.workout_sets to authenticated;

-- ============================================================ body weight and height (private)
-- Only the owner ever reads these. No visibility setting, no friend policy, and no public view
-- or RPC mentions them (public_profiles and public_profile() list their fields explicitly).
create table public.body_weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  measured_on date not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 20 and 400),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);
alter table public.body_weights enable row level security;
create policy body_weights_select_owner on public.body_weights
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.body_weights to authenticated;

-- readable only through the owner-only profiles row; written only by set_height()
alter table public.profiles
  add column height_cm numeric(4, 1) check (height_cm between 80 and 250);

-- ============================================================ deleted accounts
do $$
declare
  t text;
begin
  foreach t in array array[
    'books', 'reading_entries', 'exercises', 'workout_sessions', 'workout_sets', 'body_weights'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I '
      'for each statement execute function public.forbid_deleted_actor()',
      t || '_forbid_deleted_actor', t);
  end loop;
end;
$$;

-- ============================================================ RPCs: reading
create function public.save_reading_entry(
  p_checkin_id uuid, p_book_id uuid, p_from_page int, p_to_page int, p_finished boolean default false
)
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
  v_total int;
  v_id uuid;
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
  if v_log_type <> 'reading' then
    raise exception 'log_type_mismatch';
  end if;

  select b.total_pages into v_total
  from public.books b
  where b.id = p_book_id and b.user_id = v_uid;
  if not found then
    raise exception 'book_not_found';
  end if;

  if p_from_page is null or p_to_page is null
     or p_from_page < 0 or p_to_page < p_from_page or p_to_page > 20000
     or (v_total is not null and p_to_page > v_total) then
    raise exception 'invalid_pages';
  end if;

  insert into public.reading_entries as r (user_id, habit_id, checkin_id, book_id, local_date, from_page, to_page)
  values (v_uid, v_habit, p_checkin_id, p_book_id, v_date, p_from_page, p_to_page)
  on conflict (checkin_id) do update
    set book_id = excluded.book_id,
        from_page = excluded.from_page,
        to_page = excluded.to_page,
        updated_at = pg_catalog.now()
  returning r.id into v_id;

  if p_finished then
    update public.books b set status = 'finished', finished_on = v_date
    where b.id = p_book_id and b.user_id = v_uid;
  end if;
  return v_id;
end;
$$;

create function public.delete_reading_entry(p_checkin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.reading_entries r where r.checkin_id = p_checkin_id and r.user_id = v_uid;
end;
$$;

-- ============================================================ RPCs: workout
create function public.save_workout(p_checkin_id uuid, p_day_types text[], p_sets jsonb)
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

create function public.delete_workout(p_checkin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.workout_sessions s where s.checkin_id = p_checkin_id and s.user_id = v_uid;
end;
$$;

-- ============================================================ RPCs: body weight and height
create function public.log_body_weight(p_kg numeric, p_date date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_today date;
  v_date date;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select p.timezone into v_tz from public.profiles p where p.id = v_uid and p.deleted_at is null;
  if not found then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_kg is null or p_kg < 20 or p_kg > 400 then
    raise exception 'invalid_weight';
  end if;
  v_today := (pg_catalog.now() at time zone v_tz)::date;
  v_date := coalesce(p_date, v_today);
  if v_date > v_today then
    raise exception 'weight_date_future';
  end if;
  if v_date < (v_today - interval '5 years')::date then
    raise exception 'weight_date_too_old';
  end if;

  insert into public.body_weights as b (user_id, measured_on, weight_kg)
  values (v_uid, v_date, round(p_kg, 2))
  on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg
  returning b.id into v_id;
  return v_id;
end;
$$;

create function public.delete_body_weight(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.body_weights b where b.id = p_id and b.user_id = v_uid;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- null clears the height
create function public.set_height(p_cm numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_cm is not null and (p_cm < 80 or p_cm > 250) then
    raise exception 'invalid_height';
  end if;
  update public.profiles p set height_cm = round(p_cm, 1) where p.id = v_uid;
end;
$$;

-- ============================================================ execute grants
revoke execute on function public.save_reading_entry(uuid, uuid, int, int, boolean) from public, anon;
revoke execute on function public.delete_reading_entry(uuid) from public, anon;
revoke execute on function public.save_workout(uuid, text[], jsonb) from public, anon;
revoke execute on function public.delete_workout(uuid) from public, anon;
revoke execute on function public.log_body_weight(numeric, date) from public, anon;
revoke execute on function public.delete_body_weight(uuid) from public, anon;
revoke execute on function public.set_height(numeric) from public, anon;
grant execute on function public.save_reading_entry(uuid, uuid, int, int, boolean) to authenticated;
grant execute on function public.delete_reading_entry(uuid) to authenticated;
grant execute on function public.save_workout(uuid, text[], jsonb) to authenticated;
grant execute on function public.delete_workout(uuid) to authenticated;
grant execute on function public.log_body_weight(numeric, date) to authenticated;
grant execute on function public.delete_body_weight(uuid) to authenticated;
grant execute on function public.set_height(numeric) to authenticated;
