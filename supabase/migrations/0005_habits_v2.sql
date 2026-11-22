-- Habits v2: presets, visibility, daily items (steps) with optional photo, and the
-- RPCs that turn "all active items checked" into the day's check-in.

-- ----------------------------------------------------------------- habits
alter table public.habits
  add column visibility text not null default 'friends'
    constraint habits_visibility_check check (visibility in ('private', 'friends', 'public')),
  add column preset text
    constraint habits_preset_check check (preset in ('gym', 'water', 'study', 'read', 'walk', 'sleep', 'eat_well'));
grant insert (visibility, preset) on public.habits to authenticated;
grant update (visibility, preset) on public.habits to authenticated;

-- ------------------------------------------------------------ habit_items
create table public.habit_items (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id),
  user_id uuid not null references public.profiles (id),
  label text not null check (char_length(label) between 1 and 40),
  position smallint not null,
  requires_photo boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index habit_items_habit_idx on public.habit_items (habit_id);
create index habit_items_user_idx on public.habit_items (user_id);
alter table public.habit_items enable row level security;

create policy habit_items_select_owner_or_friend on public.habit_items
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      public.is_friend((select auth.uid()), user_id)
      and exists (
        select 1 from public.habits h
        where h.id = habit_id and h.visibility <> 'private'
      )
    )
  );
create policy habit_items_insert_owner on public.habit_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = (select auth.uid())
        and not h.requires_photo
    )
  );
create policy habit_items_update_owner on public.habit_items
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.habit_items to authenticated;
grant insert (habit_id, user_id, label, position, requires_photo) on public.habit_items to authenticated;
grant update (label, position, requires_photo, archived_at) on public.habit_items to authenticated;

-- ---------------------------------------------------------- checkin_items
-- Clients never write here: check_item() (no photo) and the photo endpoint (service role).
create table public.checkin_items (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.habit_items (id),
  habit_id uuid not null references public.habits (id),
  user_id uuid not null references public.profiles (id),
  local_date date not null,
  photo_path text,
  photo_sha256 text,
  is_duplicate boolean not null default false,
  created_at timestamptz not null default now(),
  constraint checkin_items_item_day_key unique (item_id, local_date),
  -- item proofs live at {user_id}/items/{checkin_item_id}.jpg
  constraint checkin_items_photo_path_shape check (
    photo_path is null or photo_path = user_id::text || '/items/' || id::text || '.jpg'
  )
);
create index checkin_items_habit_day_idx on public.checkin_items (habit_id, local_date);
create index checkin_items_user_idx on public.checkin_items (user_id);
create index checkin_items_sha_idx on public.checkin_items (user_id, photo_sha256) where photo_sha256 is not null;
alter table public.checkin_items enable row level security;

create policy checkin_items_select_owner_or_friend on public.checkin_items
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      public.is_friend((select auth.uid()), user_id)
      and exists (
        select 1 from public.habits h
        where h.id = habit_id and h.visibility <> 'private'
      )
    )
  );
grant select on public.checkin_items to authenticated;

create function public.checkin_items_mark_duplicate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_sha256 is null then
    new.is_duplicate := false;
  else
    new.is_duplicate := exists (
      select 1 from public.checkin_items c
      where c.user_id = new.user_id
        and c.photo_sha256 = new.photo_sha256
        and c.id <> new.id
    );
  end if;
  return new;
end;
$$;
revoke execute on function public.checkin_items_mark_duplicate() from public, anon, authenticated;
create trigger checkin_items_mark_duplicate
before insert or update of photo_sha256, photo_path on public.checkin_items
for each row execute function public.checkin_items_mark_duplicate();

-- ------------------------------------------------- visibility-aware reads
drop policy habits_select_owner_or_friend on public.habits;
create policy habits_select_owner_or_friend on public.habits
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (visibility <> 'private' and public.is_friend((select auth.uid()), user_id))
  );

drop policy checkins_select_owner_or_friend on public.checkins;
create policy checkins_select_owner_or_friend on public.checkins
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      public.is_friend((select auth.uid()), user_id)
      and exists (
        select 1 from public.habits h
        where h.id = habit_id and h.visibility <> 'private'
      )
    )
  );

-- Proofs: owner, or an accepted friend when the check-in (or item check-in) that
-- owns the object belongs to a habit that is not private.
drop policy proofs_select_owner_or_friend on storage.objects;
create policy proofs_select_owner_or_friend on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        public.is_friend(
          (select auth.uid()),
          case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then ((storage.foldername(name))[1])::uuid end
        )
        and (
          exists (
            select 1 from public.checkins c
            join public.habits h on h.id = c.habit_id
            where c.photo_path = objects.name and h.visibility <> 'private'
          )
          or exists (
            select 1 from public.checkin_items ci
            join public.habits h on h.id = ci.habit_id
            where ci.photo_path = objects.name and h.visibility <> 'private'
          )
        )
      )
    )
  );

-- ------------------------------------------------- visibility guard
create function public.habits_visibility_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility = 'private' and old.visibility <> 'private' and exists (
    select 1 from public.challenges c
    where c.status in ('proposed', 'active')
      and (c.creator_habit_id = new.id or c.rival_habit_id = new.id)
  ) then
    raise exception 'habit_in_challenge';
  end if;
  return new;
end;
$$;
revoke execute on function public.habits_visibility_guard() from public, anon, authenticated;
create trigger habits_visibility_guard
before update of visibility on public.habits
for each row execute function public.habits_visibility_guard();

-- ------------------------------------------------- photo guards
-- A habit that requires a photo cannot also have active items (items would let the
-- day complete without a photo), and a habit used by a proposed/active challenge that
-- requires photos keeps its photo requirement and its item list.
create function public.habits_photo_guard()
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
    select 1 from public.challenges c
    where c.status in ('proposed', 'active') and c.requires_photo
      and (c.creator_habit_id = new.id or c.rival_habit_id = new.id)
  ) then
    raise exception 'habit_in_challenge';
  end if;
  return new;
end;
$$;
revoke execute on function public.habits_photo_guard() from public, anon, authenticated;
create trigger habits_photo_guard
before update of requires_photo on public.habits
for each row execute function public.habits_photo_guard();

create function public.habit_items_challenge_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or (old.archived_at is null and new.archived_at is not null)) and exists (
    select 1 from public.challenges c
    where c.status in ('proposed', 'active') and c.requires_photo
      and (c.creator_habit_id = new.habit_id or c.rival_habit_id = new.habit_id)
  ) then
    raise exception 'habit_in_challenge';
  end if;
  return new;
end;
$$;
revoke execute on function public.habit_items_challenge_guard() from public, anon, authenticated;
create trigger habit_items_challenge_guard
before insert or update of archived_at on public.habit_items
for each row execute function public.habit_items_challenge_guard();

-- ------------------------------------------------------------- RPCs
-- Photo-less check-in. Now also refuses deleted accounts and habits with items.
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

  select h.requires_photo into v_requires_photo
  from public.habits h
  where h.id = p_habit_id and h.user_id = v_uid and h.archived_at is null;
  if not found then
    raise exception 'habit_not_found';
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

-- When every active item of the habit is checked for p_date, makes sure the day's
-- check-in exists. Returns whether the day is complete. Shared by check_item() and
-- the photo endpoint (service role); clients cannot call it.
create function public.complete_day_from_items(p_habit_id uuid, p_user_id uuid, p_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_checked int;
begin
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
revoke execute on function public.complete_day_from_items(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.complete_day_from_items(uuid, uuid, date) to service_role;

create function public.check_item(p_item_id uuid)
returns table (checkin_item_id uuid, created boolean, day_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_habit uuid;
  v_requires_photo boolean;
  v_habit_photo boolean;
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

  select i.habit_id, i.requires_photo, h.requires_photo into v_habit, v_requires_photo, v_habit_photo
  from public.habit_items i
  join public.habits h on h.id = i.habit_id
  where i.id = p_item_id and i.user_id = v_uid and i.archived_at is null
    and h.user_id = v_uid and h.archived_at is null;
  if not found then
    raise exception 'item_not_found';
  end if;
  -- items cannot be a way around a habit that asks for a photo
  if v_requires_photo or v_habit_photo then
    raise exception 'photo_required';
  end if;

  v_date := (now() at time zone v_tz)::date;

  insert into public.checkin_items as ci (item_id, habit_id, user_id, local_date)
  values (p_item_id, v_habit, v_uid, v_date)
  on conflict (item_id, local_date) do nothing
  returning ci.id into v_id;

  if v_id is not null then
    return query select v_id, true, public.complete_day_from_items(v_habit, v_uid, v_date);
  else
    return query
      select ci.id, false, public.complete_day_from_items(v_habit, v_uid, v_date)
      from public.checkin_items ci
      where ci.item_id = p_item_id and ci.local_date = v_date;
  end if;
end;
$$;

create function public.uncheck_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_habit uuid;
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

  select i.habit_id into v_habit
  from public.habit_items i
  where i.id = p_item_id and i.user_id = v_uid;
  if not found then
    raise exception 'item_not_found';
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

grant execute on function public.check_item(uuid) to authenticated;
grant execute on function public.uncheck_item(uuid) to authenticated;
