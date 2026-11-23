-- Groups (Task 36, step 1 of docs/superpowers/specs/2026-11-23-grupos-design.md, plus the database parts of steps 2 and 3).
-- Up to 50 people join by link, share one weekly commitment and each check in on their own habit. Members need not be
-- friends, so this is the first place where non-friends see each other's check-in photos. The fine (proposals, votes,
-- fund debts, photo rejection by admins) is migration 0024; nothing of it is here. No app code.
--
-- HOW IT IS BUILT
--  * Five new tables (groups, group_members, group_invites, group_weeks, group_week_results). Row level security is on,
--    they have NO policy and NO grant for anon or authenticated: clients can neither read nor write them. Everything
--    goes through SECURITY DEFINER functions with search_path = '', fully qualified names, the caller taken only from
--    (select auth.uid()), membership and role checked FIRST, no dynamic SQL.
--  * A non-member (never a member, a removed one, someone who left, a deleted account) learns nothing, not even that a
--    group exists: every read and write answers group_not_found. Only an active member who is not an admin gets
--    not_group_admin.
--  * The table policies of habits, checkins, checkin_items and habit_items do NOT change (a row policy would expose whole
--    rows: the history before joining, steps, rejection reasons). Group reads return only the fields listed in each
--    function. The one existing policy that changes is the proofs bucket select policy: one more OR branch through
--    group_proof_readable(); the owner and friend branches are copied verbatim from 0005.
--
-- DELIBERATE DISCLOSURES (owner-approved in the design)
--  1. A member sees, of every other member of a group they are in: name, @usuario, avatar, and the check-ins (date, photo,
--     creation instant) of the ONE habit linked to that group, from the member's joined_on onward. Nothing else: no other
--     habits, steps, amounts, notes, and never a rejection reason. Leaving, being removed, unlinking or archiving the
--     group ends that visibility at once.
--  2. The proofs branch lets a fellow active member read the photo of a check-in (never a step photo) that is not rejected,
--     dated on or after its owner's joined_on, of a habit linked to a live membership of a non-archived group in which the
--     caller is also a live member.
--  3. group_invite_preview is callable by anon: name, icon, colour, commitment, member count and "full" only. Never member
--     names or ids. A code is 128 bits of randomness, so it cannot be guessed; the app should still throttle the route.
--  4. Closed weeks are stored as snapshots (target, photo flag, counts, one result row per counted member). Members can
--     read the per-member result of any closed week of their group (group_week_detail).
--
-- TIME. A check-in's local_date is computed in the member's OWN profile zone (existing behaviour). A group's week is a range
-- of local dates, Monday to Sunday, in the GROUP's zone (the creator's profile zone at creation, never changes): the same
-- precedent as challenge periods, which compare their local-date range with the check-ins' local_date.
--
-- LIMITS (under row locks). 50 live members per group, 10 live groups per person, 3 admins per group, 5 active invites per
-- group. Lock order everywhere: caller's profile row (create/join only, FOR NO KEY UPDATE) -> group row -> invite row ->
-- habit row (FOR SHARE) -> member rows. The closing function takes a try-advisory lock per group first and never waits
-- for it; nothing else takes an advisory lock, so no cycle exists.
--
-- is_live. group_members.is_live is true while the membership is active AND its group is not archived. It is what the
-- limits, the "one group per habit" index, the habit guards and the proofs branch look at. Archiving or ending a
-- membership clears it. left_at is null still means "is an active member" (reads, board, wall).
--
-- INDEXES. group_members: (group_id, user_id) unique where active (membership lookups, members of a group); (habit_id)
-- unique where live (one group per habit, habit guards); (user_id) where live (10-group limit, my_groups); (habit_id) for
-- history lookups and the ON DELETE SET NULL of the habit foreign key. group_weeks primary key (group_id, week_start)
-- (closing, streak, history). group_invites (group_id, expires_at). checkins (habit_id, created_at desc, id desc) serves the
-- keyset wall: one index range per member habit, never a scan of every check-in.

-- ================================================================== 1. tables
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint groups_name_len check (char_length(name) between 3 and 40),
  icon text not null constraint groups_icon_shape check (icon ~ '^[a-z][a-z0-9-]{0,31}$'),
  color text not null constraint groups_color_check
    check (color in ('salvia', 'durazno', 'lavanda', 'arena', 'cielo', 'rosa', 'oliva', 'indigo')),
  description text constraint groups_description_len check (char_length(description) between 1 and 140),
  commitment_name text not null constraint groups_commitment_name_len check (char_length(commitment_name) between 1 and 40),
  commitment_icon text not null constraint groups_commitment_icon_shape check (commitment_icon ~ '^[a-z][a-z0-9-]{0,31}$'),
  target_per_week int not null constraint groups_target_range check (target_per_week between 1 and 7),
  requires_photo boolean not null default false,
  -- a pending change of the commitment, applied from next_effective_from (a Monday in the group's zone)
  next_commitment_name text constraint groups_next_name_len check (char_length(next_commitment_name) between 1 and 40),
  next_commitment_icon text constraint groups_next_icon_shape check (next_commitment_icon ~ '^[a-z][a-z0-9-]{0,31}$'),
  next_target_per_week int constraint groups_next_target_range check (next_target_per_week between 1 and 7),
  next_requires_photo boolean,
  next_effective_from date,
  timezone text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint groups_next_all_or_none check (
    (next_commitment_name is null) = (next_commitment_icon is null)
    and (next_commitment_name is null) = (next_target_per_week is null)
    and (next_commitment_name is null) = (next_requires_photo is null)
    and (next_commitment_name is null) = (next_effective_from is null)
  )
);
create index groups_created_by_idx on public.groups (created_by);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  user_id uuid not null references public.profiles (id),
  role text not null default 'member' constraint group_members_role_check check (role in ('admin', 'member')),
  -- the linked habit. Cleared when the habit row is deleted by the service role (account deletion).
  habit_id uuid references public.habits (id) on delete set null,
  joined_at timestamptz not null default now(),
  joined_on date not null,          -- local date in the group's zone
  counts_from date not null,        -- the Monday from which the member is evaluated
  left_at timestamptz,
  left_reason text constraint group_members_left_reason_check check (left_reason in ('left', 'removed', 'account_deleted')),
  is_live boolean not null default true,
  constraint group_members_left_pair check ((left_at is null) = (left_reason is null)),
  constraint group_members_live_active check (left_at is null or not is_live)
);
create unique index group_members_active_key on public.group_members (group_id, user_id) where left_at is null;
create unique index group_members_live_habit_key on public.group_members (habit_id) where is_live and habit_id is not null;
create index group_members_user_live_idx on public.group_members (user_id) where is_live;
create index group_members_habit_idx on public.group_members (habit_id) where habit_id is not null;

create table public.group_invites (
  code text primary key default encode(extensions.gen_random_bytes(16), 'hex'),
  group_id uuid not null references public.groups (id),
  created_by uuid not null references public.profiles (id),
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null constraint group_invites_max_uses_check check (max_uses >= 1),
  uses int not null default 0 constraint group_invites_uses_check check (uses >= 0),
  created_at timestamptz not null default now(),
  constraint group_invites_uses_le_max check (uses <= max_uses)
);
create index group_invites_group_idx on public.group_invites (group_id, expires_at);
create index group_invites_created_by_idx on public.group_invites (created_by);

create table public.group_weeks (
  group_id uuid not null references public.groups (id),
  week_start date not null constraint group_weeks_monday check (extract(isodow from week_start) = 1),
  closed_at timestamptz not null,
  commitment_name text not null,
  target_per_week int not null,
  requires_photo boolean not null,
  members_counted int not null constraint group_weeks_counted_check check (members_counted >= 0),
  members_complied int not null constraint group_weeks_complied_check check (members_complied >= 0),
  primary key (group_id, week_start),
  constraint group_weeks_complied_le_counted check (members_complied <= members_counted)
);

create table public.group_week_results (
  group_id uuid not null references public.groups (id),
  week_start date not null,
  user_id uuid not null references public.profiles (id),
  done int not null,
  target int not null,
  complied boolean not null,
  primary key (group_id, week_start, user_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_weeks enable row level security;
alter table public.group_week_results enable row level security;
-- no policy and no grant: the default privileges already give clients nothing; say it again explicitly
revoke all on public.groups, public.group_members, public.group_invites, public.group_weeks, public.group_week_results
  from public, anon, authenticated;

-- deleted accounts keep a valid JWT until it expires: writes made in their name are refused (0014)
create trigger groups_forbid_deleted_actor before insert or update or delete on public.groups
  for each statement execute function public.forbid_deleted_actor();
create trigger group_members_forbid_deleted_actor before insert or update or delete on public.group_members
  for each statement execute function public.forbid_deleted_actor();
create trigger group_invites_forbid_deleted_actor before insert or update or delete on public.group_invites
  for each statement execute function public.forbid_deleted_actor();

-- the wall reads one index range per member habit, newest first
create index checkins_habit_created_idx on public.checkins (habit_id, created_at desc, id desc);

-- ================================================================== 2. helpers (never callable by clients)
create function public.groups_week_start(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date - (extract(isodow from p_date)::int - 1);
$$;

-- joined on a Monday: that Monday; otherwise the next Monday
create function public.groups_counts_from(p_joined_on date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_joined_on + ((8 - extract(isodow from p_joined_on)::int) % 7);
$$;

-- strictly after the given date (from a Monday: a week later)
create function public.groups_next_monday(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date + (8 - extract(isodow from p_date)::int);
$$;

-- the caller: not_authenticated (28000) without a session, (42501) for a deleted account
create function public.groups_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- 'admin' | 'member' for an ACTIVE member, null for anyone else
create function public.groups_member_role(p_uid uuid, p_group_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.group_members m
  where m.group_id = p_group_id and m.user_id = p_uid and m.left_at is null;
$$;

-- Locks the group row for an admin action. A non-member gets group_not_found without the row being touched; the role is
-- checked again under the lock.
create function public.groups_lock_admin(p_uid uuid, p_group_id uuid)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
  v_role text;
begin
  if public.groups_member_role(p_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  select x.* into g from public.groups x where x.id = p_group_id for update;
  v_role := public.groups_member_role(p_uid, p_group_id);
  if v_role is null then
    raise exception 'group_not_found';
  end if;
  if v_role <> 'admin' then
    raise exception 'not_group_admin';
  end if;
  if g.archived_at is not null then
    raise exception 'group_archived';
  end if;
  return g;
end;
$$;

create function public.groups_validate_info(p_name text, p_icon text, p_color text, p_description text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_name is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 3 and 40
     or pg_catalog.btrim(p_name) ~ '[[:cntrl:]]' then
    raise exception 'invalid_group';
  end if;
  if p_icon is null or p_icon !~ '^[a-z][a-z0-9-]{0,31}$' then
    raise exception 'invalid_group';
  end if;
  if p_color is null or p_color not in ('salvia', 'durazno', 'lavanda', 'arena', 'cielo', 'rosa', 'oliva', 'indigo') then
    raise exception 'invalid_group';
  end if;
  if p_description is not null and (pg_catalog.char_length(pg_catalog.btrim(p_description)) > 140
     or p_description ~ '[\x01-\x09\x0b-\x1f\x7f]') then
    raise exception 'invalid_group';
  end if;
end;
$$;

create function public.groups_validate_commitment(p_name text, p_icon text, p_target int, p_requires_photo boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_name is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 40
     or pg_catalog.btrim(p_name) ~ '[[:cntrl:]]' then
    raise exception 'invalid_group';
  end if;
  if p_icon is null or p_icon !~ '^[a-z][a-z0-9-]{0,31}$' then
    raise exception 'invalid_group';
  end if;
  if p_target is null or p_target not between 1 and 7 or p_requires_photo is null then
    raise exception 'invalid_group';
  end if;
end;
$$;

-- A linked habit is the caller's own, not archived, not private, not a quantity habit, with photo proof when the group asks
-- for photos, and not linked to another live membership. It may also be in a 1-on-1 challenge. The habit row is locked
-- FOR SHARE so a concurrent client update of it (private, archived, ...) waits for this transaction and then meets the
-- habit guard.
create function public.groups_check_habit(p_uid uuid, p_habit_id uuid, p_requires_photo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.habits h
  where h.id = p_habit_id and h.user_id = p_uid and h.archived_at is null and h.visibility <> 'private'
    and h.log_type is distinct from 'quantity' and (not p_requires_photo or h.requires_photo)
  for share;
  if not found then
    raise exception 'habit_not_eligible';
  end if;
  if exists (select 1 from public.group_members m where m.habit_id = p_habit_id and m.is_live) then
    raise exception 'habit_in_group';
  end if;
end;
$$;

-- Consecutive most recent closed weeks with members_complied * 2 >= members_counted. A week with zero counted members is
-- skipped: it neither breaks nor extends the streak.
create function public.groups_streak(p_group_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.min(s.rn) filter (where not s.ok) - 1, pg_catalog.count(*))::int
  from (
    select (w.members_complied * 2 >= w.members_counted) as ok,
           pg_catalog.row_number() over (order by w.week_start desc) as rn
    from public.group_weeks w
    where w.group_id = p_group_id and w.members_counted > 0
  ) s;
$$;

-- ================================================================== 3. write RPCs
create function public.create_group(
  p_name text, p_icon text, p_color text, p_description text,
  p_commitment_name text, p_commitment_icon text, p_target_per_week integer, p_requires_photo boolean,
  p_habit_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  v_tz text;
  v_id uuid;
  v_on date;
begin
  perform public.groups_validate_info(p_name, p_icon, p_color, p_description);
  perform public.groups_validate_commitment(p_commitment_name, p_commitment_icon, p_target_per_week, p_requires_photo);
  -- serialises this person's own creates and joins, so the 10-group count cannot be raced past
  perform 1 from public.profiles p where p.id = v_uid and p.deleted_at is null for no key update;
  if (select pg_catalog.count(*) from public.group_members m where m.user_id = v_uid and m.is_live) >= 10 then
    raise exception 'group_limit';
  end if;
  perform public.groups_check_habit(v_uid, p_habit_id, p_requires_photo);

  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  v_on := (pg_catalog.now() at time zone v_tz)::date;
  insert into public.groups (name, icon, color, description, commitment_name, commitment_icon, target_per_week,
                             requires_photo, timezone, created_by)
  values (pg_catalog.btrim(p_name), p_icon, p_color, nullif(pg_catalog.btrim(p_description), ''),
          pg_catalog.btrim(p_commitment_name), p_commitment_icon, p_target_per_week, p_requires_photo, v_tz, v_uid)
  returning id into v_id;
  begin
    insert into public.group_members (group_id, user_id, role, habit_id, joined_on, counts_from)
    values (v_id, v_uid, 'admin', p_habit_id, v_on, public.groups_counts_from(v_on));
  exception when unique_violation then
    raise exception 'habit_in_group';
  end;
  return v_id;
end;
$$;

create function public.update_group(
  p_group_id uuid, p_name text, p_icon text, p_color text, p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
begin
  g := public.groups_lock_admin(v_uid, p_group_id);
  perform public.groups_validate_info(p_name, p_icon, p_color, p_description);
  update public.groups x
  set name = pg_catalog.btrim(p_name), icon = p_icon, color = p_color, description = nullif(pg_catalog.btrim(p_description), '')
  where x.id = g.id;
end;
$$;

-- Effective next Monday in the group's zone; replaces a pending change. Weeks already closed are never touched.
create function public.set_group_commitment(
  p_group_id uuid, p_commitment_name text, p_commitment_icon text, p_target_per_week integer, p_requires_photo boolean
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  v_from date;
begin
  g := public.groups_lock_admin(v_uid, p_group_id);
  perform public.groups_validate_commitment(p_commitment_name, p_commitment_icon, p_target_per_week, p_requires_photo);
  v_from := public.groups_next_monday((pg_catalog.now() at time zone g.timezone)::date);
  update public.groups x
  set next_commitment_name = pg_catalog.btrim(p_commitment_name), next_commitment_icon = p_commitment_icon,
      next_target_per_week = p_target_per_week, next_requires_photo = p_requires_photo, next_effective_from = v_from
  where x.id = g.id;
  return v_from;
end;
$$;

-- Read-only from now on. Members stay (they still read it) but their habits are free again (is_live false).
create function public.archive_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
begin
  g := public.groups_lock_admin(v_uid, p_group_id);
  update public.groups x set archived_at = pg_catalog.now() where x.id = g.id;
  update public.group_members m set is_live = false where m.group_id = g.id and m.is_live;
end;
$$;

-- max_uses is the number of free seats when the invite is made; the seat limit itself is enforced again at join time.
create function public.create_group_invite(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  v_free int;
  v_code text;
begin
  g := public.groups_lock_admin(v_uid, p_group_id);
  v_free := 50 - (select pg_catalog.count(*) from public.group_members m where m.group_id = g.id and m.left_at is null)::int;
  if v_free <= 0 then
    raise exception 'group_full';
  end if;
  if (select pg_catalog.count(*) from public.group_invites i
      where i.group_id = g.id and i.expires_at > pg_catalog.now() and i.uses < i.max_uses) >= 5 then
    raise exception 'invite_limit';
  end if;
  insert into public.group_invites (group_id, created_by, max_uses) values (g.id, v_uid, v_free) returning code into v_code;
  return v_code;
end;
$$;

-- Anyone may ask (anon included). Exactly nine keys; null for an unknown, malformed, expired, used-up code or an archived group.
create function public.group_invite_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_code is null or p_code !~ '^[0-9a-f]{32}$' then
    return null;
  end if;
  select pg_catalog.jsonb_build_object(
    'name', g.name, 'icon', g.icon, 'color', g.color,
    'commitment_name', g.commitment_name, 'commitment_icon', g.commitment_icon,
    'target_per_week', g.target_per_week, 'requires_photo', g.requires_photo,
    'member_count', n.c, 'full', n.c >= 50)
  into v_result
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  cross join lateral (
    select pg_catalog.count(*)::int as c from public.group_members m where m.group_id = g.id and m.left_at is null
  ) n
  where i.code = p_code and i.expires_at > pg_catalog.now() and i.uses < i.max_uses and g.archived_at is null;
  return v_result;
end;
$$;

create function public.join_group(p_code text, p_habit_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  v_gid uuid;
  g public.groups;
  v_inv public.group_invites;
  v_on date;
  v_name text;
begin
  select i.group_id into v_gid from public.group_invites i where i.code = p_code;
  if not found then
    raise exception 'invite_not_found';
  end if;
  -- lock order: caller's profile -> group -> invite -> habit
  perform 1 from public.profiles p where p.id = v_uid and p.deleted_at is null for no key update;
  select x.* into g from public.groups x where x.id = v_gid for update;
  if g.archived_at is not null then
    raise exception 'invite_not_found';
  end if;
  select i.* into v_inv from public.group_invites i where i.code = p_code for update;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if v_inv.expires_at <= pg_catalog.now() or v_inv.uses >= v_inv.max_uses then
    raise exception 'invite_expired';
  end if;
  if public.groups_member_role(v_uid, g.id) is not null then
    raise exception 'already_member';
  end if;
  if (select pg_catalog.count(*) from public.group_members m where m.group_id = g.id and m.left_at is null) >= 50 then
    raise exception 'group_full';
  end if;
  if (select pg_catalog.count(*) from public.group_members m where m.user_id = v_uid and m.is_live) >= 10 then
    raise exception 'group_limit';
  end if;
  perform public.groups_check_habit(v_uid, p_habit_id, g.requires_photo);

  v_on := (pg_catalog.now() at time zone g.timezone)::date;
  begin
    insert into public.group_members (group_id, user_id, role, habit_id, joined_on, counts_from)
    values (g.id, v_uid, 'member', p_habit_id, v_on, public.groups_counts_from(v_on));
  exception when unique_violation then
    raise exception 'habit_in_group';
  end;
  update public.group_invites i set uses = i.uses + 1 where i.code = v_inv.code;

  select p.display_name into v_name from public.profiles p where p.id = v_uid;
  insert into public.notifications (user_id, type, payload)
  select m.user_id, 'group_member_joined',
         pg_catalog.jsonb_build_object('group_id', g.id, 'group_name', g.name, 'user_id', v_uid, 'display_name', v_name)
  from public.group_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  where m.group_id = g.id and m.role = 'admin' and m.left_at is null and m.user_id <> v_uid;
  return g.id;
end;
$$;

-- The only admin cannot leave while others remain; the last member leaving archives the group. Leaving an archived group
-- is allowed (it only removes the caller from the list).
create function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  v_role text;
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  select x.* into g from public.groups x where x.id = p_group_id for update;
  v_role := public.groups_member_role(v_uid, p_group_id);
  if v_role is null then
    raise exception 'group_not_found';
  end if;
  if v_role = 'admin' and g.archived_at is null
     and not exists (select 1 from public.group_members m
                     where m.group_id = g.id and m.left_at is null and m.role = 'admin' and m.user_id <> v_uid)
     and exists (select 1 from public.group_members m where m.group_id = g.id and m.left_at is null and m.user_id <> v_uid) then
    raise exception 'last_admin';
  end if;
  update public.group_members m
  set left_at = pg_catalog.now(), left_reason = 'left', is_live = false
  where m.group_id = g.id and m.user_id = v_uid and m.left_at is null;
  if not exists (select 1 from public.group_members m where m.group_id = g.id and m.left_at is null) then
    update public.groups x set archived_at = coalesce(x.archived_at, pg_catalog.now()) where x.id = g.id;
  end if;
end;
$$;

create function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
begin
  g := public.groups_lock_admin(v_uid, p_group_id);
  if p_user_id is not distinct from v_uid then
    raise exception 'cannot_remove_self';
  end if;
  update public.group_members m
  set left_at = pg_catalog.now(), left_reason = 'removed', is_live = false
  where m.group_id = g.id and m.user_id = p_user_id and m.left_at is null;
  if not found then
    raise exception 'not_group_member';
  end if;
end;
$$;

create function public.set_group_admin(p_group_id uuid, p_user_id uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  v_target text;
begin
  g := public.groups_lock_admin(v_uid, p_group_id);
  if p_admin is null then
    raise exception 'invalid_group';
  end if;
  v_target := public.groups_member_role(p_user_id, g.id);
  if v_target is null then
    raise exception 'not_group_member';
  end if;
  if p_admin then
    if v_target = 'admin' then
      return;
    end if;
    if (select pg_catalog.count(*) from public.group_members m where m.group_id = g.id and m.left_at is null and m.role = 'admin') >= 3 then
      raise exception 'admin_limit';
    end if;
  elsif v_target = 'admin'
        and not exists (select 1 from public.group_members m
                        where m.group_id = g.id and m.left_at is null and m.role = 'admin' and m.user_id <> p_user_id) then
    raise exception 'last_admin';
  end if;
  update public.group_members m set role = case when p_admin then 'admin' else 'member' end
  where m.group_id = g.id and m.user_id = p_user_id and m.left_at is null;
end;
$$;

-- ================================================================== 4. read RPCs (active members only)
create function public.my_groups()
returns table (
  id uuid, name text, icon text, color text, role text, member_count integer,
  commitment_name text, commitment_icon text, target_per_week integer, requires_photo boolean,
  my_done integer, my_counts boolean, complied_count integer, counted_count integer, streak integer, archived boolean,
  my_habit_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.groups_actor();
begin
  return query
  with g as (
    select x.*, public.groups_week_start((pg_catalog.now() at time zone x.timezone)::date) as wk
    from public.groups x
    where x.id in (select m.group_id from public.group_members m where m.user_id = v_uid and m.left_at is null)
  ),
  mem as (
    -- one statement for every member of every one of my groups: this week's valid check-ins per member
    select m.group_id, m.user_id, m.role, m.habit_id, m.counts_from, g.wk, g.target_per_week as target,
           pg_catalog.count(c.id)::int as done
    from public.group_members m
    join g on g.id = m.group_id
    left join public.checkins c
      on c.habit_id = m.habit_id and c.local_date between g.wk and g.wk + 6 and c.local_date >= m.joined_on
     and c.rejected_at is null and (not g.requires_photo or c.photo_path is not null)
    where m.left_at is null
    group by m.group_id, m.user_id, m.role, m.habit_id, m.counts_from, g.wk, g.target_per_week
  ),
  agg as (
    select mem.group_id,
           pg_catalog.count(*)::int as member_count,
           (pg_catalog.count(*) filter (where mem.counts_from <= mem.wk))::int as counted,
           (pg_catalog.count(*) filter (where mem.counts_from <= mem.wk and mem.done >= mem.target))::int as complied
    from mem group by mem.group_id
  ),
  st as (
    select s.group_id, coalesce(pg_catalog.min(s.rn) filter (where not s.ok) - 1, pg_catalog.count(*))::int as streak
    from (
      select w.group_id, (w.members_complied * 2 >= w.members_counted) as ok,
             pg_catalog.row_number() over (partition by w.group_id order by w.week_start desc) as rn
      from public.group_weeks w
      where w.members_counted > 0 and w.group_id in (select g2.id from g g2)
    ) s group by s.group_id
  )
  select g.id, g.name, g.icon, g.color, me.role, agg.member_count,
         g.commitment_name, g.commitment_icon, g.target_per_week, g.requires_photo,
         me.done, (me.counts_from <= g.wk), agg.complied, agg.counted, coalesce(st.streak, 0), (g.archived_at is not null),
         me.habit_id
  from g
  join agg on agg.group_id = g.id
  join mem me on me.group_id = g.id and me.user_id = v_uid
  left join st on st.group_id = g.id
  order by (g.archived_at is not null), g.name, g.id;
end;
$$;

create function public.group_detail(p_group_id uuid)
returns table (
  id uuid, name text, icon text, color text, description text,
  commitment_name text, commitment_icon text, target_per_week integer, requires_photo boolean,
  next_commitment_name text, next_commitment_icon text, next_target_per_week integer, next_requires_photo boolean,
  next_effective_from date, timezone text, archived_at timestamptz,
  my_role text, my_habit_id uuid, streak integer, member_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.groups_actor();
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  return query
  select g.id, g.name, g.icon, g.color, g.description,
         g.commitment_name, g.commitment_icon, g.target_per_week, g.requires_photo,
         g.next_commitment_name, g.next_commitment_icon, g.next_target_per_week, g.next_requires_photo,
         g.next_effective_from, g.timezone, g.archived_at,
         me.role, me.habit_id, public.groups_streak(g.id),
         (select pg_catalog.count(*)::int from public.group_members m where m.group_id = g.id and m.left_at is null)
  from public.groups g
  join public.group_members me on me.group_id = g.id and me.user_id = v_uid and me.left_at is null
  where g.id = p_group_id;
end;
$$;

-- one statement: this week's valid check-ins of every active member, grouped
create function public.group_board(p_group_id uuid)
returns table (
  user_id uuid, username text, display_name text, avatar_path text, avatar_preset smallint,
  role text, joined_on date, counts boolean, done integer, target integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.groups_actor();
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  return query
  select m.user_id, p.username::text, p.display_name, p.avatar_path, p.avatar_preset,
         m.role, m.joined_on, (m.counts_from <= w.wk), pg_catalog.count(c.id)::int, g.target_per_week
  from public.groups g
  cross join lateral (select public.groups_week_start((pg_catalog.now() at time zone g.timezone)::date) as wk) w
  join public.group_members m on m.group_id = g.id and m.left_at is null
  join public.profiles p on p.id = m.user_id
  left join public.checkins c
    on c.habit_id = m.habit_id and c.local_date between w.wk and w.wk + 6 and c.local_date >= m.joined_on
   and c.rejected_at is null and (not g.requires_photo or c.photo_path is not null)
  where g.id = p_group_id
  group by m.user_id, p.username, p.display_name, p.avatar_path, p.avatar_preset, m.role, m.joined_on, m.counts_from, w.wk, g.target_per_week
  order by pg_catalog.count(c.id) desc, p.username::text, m.user_id;
end;
$$;

-- Keyset, newest first. Check-ins of the habit linked to this group, of active members, dated on or after that member's
-- joined_on, not rejected. Never habit rows, steps, amounts, notes or rejection data.
create function public.group_wall(
  p_group_id uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20
)
returns table (
  checkin_id uuid, user_id uuid, username text, display_name text, avatar_path text, avatar_preset smallint,
  local_date date, photo_path text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.groups_actor();
  v_limit integer := greatest(1, least(50, coalesce(p_limit, 20)));
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  return query
  select c.id, m.user_id, p.username::text, p.display_name, p.avatar_path, p.avatar_preset, c.local_date, c.photo_path, c.created_at
  from public.group_members m
  join public.profiles p on p.id = m.user_id
  cross join lateral (
    select k.id, k.local_date, k.photo_path, k.created_at
    from public.checkins k
    where k.habit_id = m.habit_id and k.local_date >= m.joined_on and k.rejected_at is null
      and (p_before is null or k.created_at < p_before
           or (p_before_id is not null and k.created_at = p_before and k.id < p_before_id))
    order by k.created_at desc, k.id desc
    limit v_limit
  ) c
  where m.group_id = p_group_id and m.left_at is null and m.habit_id is not null
  order by c.created_at desc, c.id desc
  limit v_limit;
end;
$$;

create function public.group_history(p_group_id uuid, p_limit integer default 12)
returns table (
  week_start date, target_per_week integer, requires_photo boolean,
  members_counted integer, members_complied integer, my_complied boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.groups_actor();
  v_limit integer := greatest(1, least(52, coalesce(p_limit, 12)));
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  return query
  select w.week_start, w.target_per_week, w.requires_photo, w.members_counted, w.members_complied, r.complied
  from public.group_weeks w
  left join public.group_week_results r on r.group_id = w.group_id and r.week_start = w.week_start and r.user_id = v_uid
  where w.group_id = p_group_id
  order by w.week_start desc
  limit v_limit;
end;
$$;

create function public.group_week_detail(p_group_id uuid, p_week_start date)
returns table (
  user_id uuid, username text, display_name text, avatar_path text, avatar_preset smallint,
  done integer, target integer, complied boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.groups_actor();
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  return query
  select r.user_id, p.username::text, p.display_name, p.avatar_path, p.avatar_preset, r.done, r.target, r.complied
  from public.group_week_results r
  join public.profiles p on p.id = r.user_id
  where r.group_id = p_group_id and r.week_start = p_week_start
  order by r.done desc, p.username::text, r.user_id;
end;
$$;

-- ================================================================== 5. closing weeks (service role)
-- Applies a pending commitment change once its Monday has arrived AND the week before it is closed, so a week is never
-- evaluated with a commitment that started after it.
create function public.groups_apply_pending(p_group_id uuid, p_now timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.groups g
  set commitment_name = g.next_commitment_name, commitment_icon = g.next_commitment_icon,
      target_per_week = g.next_target_per_week, requires_photo = g.next_requires_photo,
      next_commitment_name = null, next_commitment_icon = null, next_target_per_week = null,
      next_requires_photo = null, next_effective_from = null
  where g.id = p_group_id and g.next_effective_from is not null
    and g.next_effective_from <= (p_now at time zone g.timezone)::date
    and exists (select 1 from public.group_weeks w where w.group_id = g.id and w.week_start = g.next_effective_from - 7);
$$;

-- One week of one group, in the caller's transaction: results (one statement, no per-member query), then the week row with
-- the snapshot, then the notifications (only when this call really closed the week).
create function public.groups_close_week(p_group_id uuid, p_week date, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
  v_from timestamptz;
  v_to timestamptz;
  v_counted int;
  v_complied int;
  v_rows int;
begin
  select x.* into g from public.groups x where x.id = p_group_id;
  v_from := p_week::timestamp at time zone g.timezone;
  v_to := (p_week + 7)::timestamp at time zone g.timezone;

  with cand as (
    -- members evaluated that week: counted from that Monday on, active at some moment of it. A member who left is still
    -- evaluated; one removed by an admin or whose account was deleted is not.
    select distinct on (m.user_id) m.user_id, m.habit_id, m.joined_on
    from public.group_members m
    where m.group_id = g.id and m.counts_from <= p_week and m.joined_at < v_to
      and (m.left_at is null or m.left_at > v_from) and (m.left_reason is null or m.left_reason = 'left')
    order by m.user_id, m.joined_at desc
  ),
  res as (
    select cand.user_id, pg_catalog.count(c.id)::int as done
    from cand
    left join public.checkins c
      on c.habit_id = cand.habit_id and c.local_date between p_week and p_week + 6 and c.local_date >= cand.joined_on
     and c.rejected_at is null and (not g.requires_photo or c.photo_path is not null)
    group by cand.user_id
  ),
  ins as (
    insert into public.group_week_results (group_id, week_start, user_id, done, target, complied)
    select g.id, p_week, res.user_id, res.done, g.target_per_week, res.done >= g.target_per_week from res
    on conflict do nothing
    returning complied
  )
  select pg_catalog.count(*)::int, (pg_catalog.count(*) filter (where ins.complied))::int into v_counted, v_complied from ins;

  insert into public.group_weeks (group_id, week_start, closed_at, commitment_name, target_per_week, requires_photo,
                                  members_counted, members_complied)
  values (g.id, p_week, p_now, g.commitment_name, g.target_per_week, g.requires_photo, v_counted, v_complied)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    insert into public.notifications (user_id, type, payload)
    select r.user_id, 'group_week_closed',
           pg_catalog.jsonb_build_object('group_id', g.id, 'group_name', g.name, 'week_start', p_week,
                                         'complied', r.complied, 'members_complied', v_complied, 'members_counted', v_counted)
    from public.group_week_results r
    join public.group_members m on m.group_id = r.group_id and m.user_id = r.user_id and m.left_at is null
    join public.profiles p on p.id = r.user_id and p.deleted_at is null
    where r.group_id = g.id and r.week_start = p_week;
  end if;
end;
$$;

create function public.groups_close_group(p_group_id uuid, p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
  v_wk date;
  v_today date;
  v_n int := 0;
begin
  loop
    perform public.groups_apply_pending(p_group_id, p_now);
    select x.* into g from public.groups x where x.id = p_group_id;
    exit when g.archived_at is not null;
    select coalesce(pg_catalog.max(w.week_start) + 7,
                    public.groups_week_start((g.created_at at time zone g.timezone)::date))
      into v_wk from public.group_weeks w where w.group_id = g.id;
    v_today := (p_now at time zone g.timezone)::date;
    exit when v_wk + 7 > v_today;
    -- a photo can still be rejected for 24 hours: wait until the last photos of the week are older than that
    if g.requires_photo and exists (
      select 1 from public.group_members m
      join public.checkins c on c.habit_id = m.habit_id
      where m.group_id = g.id and c.local_date between v_wk and v_wk + 6 and c.photo_path is not null
        and c.rejected_at is null and c.created_at > p_now - interval '24 hours'
    ) then
      exit;
    end if;
    begin
      perform public.groups_close_week(g.id, v_wk, p_now);
      v_n := v_n + 1;
    exception when others then
      raise warning 'groups_close_group % week %: %', g.id, v_wk, sqlerrm;
      exit;
    end;
  end loop;
  return v_n;
end;
$$;

-- Closes every week that has ended in its group's zone (and whose photos are older than 24 hours), oldest first, one
-- atomic block per week. Idempotent. A group whose try-lock is taken is being closed by another run: skipped. At most 500
-- groups per call (xact advisory locks pile up until the end); the cron simply comes back.
create function public.close_due_group_weeks(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_total int := 0;
begin
  for r in
    select x.id
    from public.groups x
    where x.archived_at is null
      and (p_now at time zone x.timezone)::date >=
          coalesce((select pg_catalog.max(w.week_start) + 7 from public.group_weeks w where w.group_id = x.id),
                   public.groups_week_start((x.created_at at time zone x.timezone)::date)) + 7
    order by x.id
    limit 500
  loop
    if pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('group_close:' || r.id::text, 0)) then
      v_total := v_total + public.groups_close_group(r.id, p_now);
    end if;
  end loop;
  return v_total;
end;
$$;

-- ================================================================== 6. guards
-- Linked habit of the CALLER (a client may only ask about its own). Needed by the invoker-side trigger below: clients
-- cannot read group_members.
create function public.habit_group_link(p_habit_id uuid)
returns table (linked boolean, requires_photo boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select true, (g.requires_photo or coalesce(g.next_requires_photo, false))
  from public.group_members m
  join public.groups g on g.id = m.group_id
  where m.habit_id = p_habit_id and m.user_id = (select auth.uid()) and m.is_live
  limit 1;
$$;

-- While a habit is linked to a live membership it cannot become private, be archived or deleted, become a quantity habit,
-- or lose photo proof when the group asks for photos. SECURITY INVOKER on purpose, like habits_switch_guard (0021):
-- current_user tells a direct client write from a definer RPC, the service role and the table owner, which are not
-- subject to it.
create function public.habits_group_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_photo boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select l.requires_photo into v_photo from public.habit_group_link(old.id) l;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'habit_in_group';
  end if;
  if (new.visibility = 'private' and old.visibility <> 'private')
     or (new.archived_at is not null and old.archived_at is null)
     or (new.log_type = 'quantity' and old.log_type is distinct from 'quantity')
     or (old.requires_photo and not new.requires_photo and v_photo) then
    raise exception 'habit_in_group';
  end if;
  return new;
end;
$$;
create trigger habits_group_guard
  before update of visibility, archived_at, log_type, requires_photo on public.habits
  for each row execute function public.habits_group_guard();
create trigger habits_group_guard_delete
  before delete on public.habits
  for each row execute function public.habits_group_guard();

-- Deleting an account (soft delete: deleted_at set) ends its memberships. If it was the only admin, the longest-standing
-- remaining member becomes admin; a group left with no members is archived.
create function public.profiles_end_group_memberships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_role text;
begin
  for r in
    select g.id
    from public.group_members m
    join public.groups g on g.id = m.group_id
    where m.user_id = new.id and m.left_at is null
    order by g.id
    for update of g
  loop
    select m.role into v_role from public.group_members m
    where m.group_id = r.id and m.user_id = new.id and m.left_at is null;
    update public.group_members m
    set left_at = pg_catalog.now(), left_reason = 'account_deleted', is_live = false
    where m.group_id = r.id and m.user_id = new.id and m.left_at is null;
    if v_role = 'admin' and not exists (
      select 1 from public.group_members m where m.group_id = r.id and m.left_at is null and m.role = 'admin'
    ) then
      update public.group_members m set role = 'admin'
      where m.id = (select k.id from public.group_members k where k.group_id = r.id and k.left_at is null
                    order by k.joined_at, k.id limit 1);
    end if;
    if not exists (select 1 from public.group_members m where m.group_id = r.id and m.left_at is null) then
      update public.groups x set archived_at = coalesce(x.archived_at, pg_catalog.now()) where x.id = r.id;
    end if;
  end loop;
  return null;
end;
$$;
create trigger profiles_end_group_memberships
  after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.profiles_end_group_memberships();

-- 0020's helper plus group weeks: a date inside a CLOSED group week of a habit linked to that group (then or now, from the
-- member's joined_on up to the day they left) is closed too. The challenge part is unchanged. The existing delete guard
-- (checkins_period_guard) then refuses with period_closed.
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
    join public.challenges ch on ch.creator_habit_id = h.id or ch.rival_habit_id = h.id
    join public.challenge_periods cp on cp.challenge_id = ch.id
    where h.id = p_habit_id and h.user_id = v_uid
      and cp.closed_at is not null
      and p_date between cp.period_start and cp.period_end
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

-- ================================================================== 7. photos
-- True when the caller may read this proofs object as a fellow group member: the object is the photo of a check-in (the
-- folder/id.jpg shape, never a step photo under items/), not rejected, dated on or after its owner's joined_on, of a habit
-- linked to a live membership of a non-archived group in which the caller is also a live member. The check-in is found by
-- the id in the object name (primary key), never by scanning.
create function public.group_proof_readable(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null or p_name is null
     or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then
    return false;
  end if;
  v_id := ((pg_catalog.regexp_match(p_name, '^[^/]+/([^/]+)\.jpg$'))[1])::uuid;
  return exists (
    select 1
    from public.checkins c
    join public.group_members om on om.habit_id = c.habit_id and om.user_id = c.user_id and om.is_live
    join public.groups g on g.id = om.group_id and g.archived_at is null
    join public.group_members me on me.group_id = om.group_id and me.user_id = v_uid and me.is_live
    where c.id = v_id and c.photo_path = p_name and c.rejected_at is null and c.local_date >= om.joined_on
  );
end;
$$;

-- The owner and friend branches are 0005's, word for word; only the last OR is new.
alter policy proofs_select_owner_or_friend on storage.objects
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
      or public.group_proof_readable(name)
    )
  );

-- ================================================================== 8. grants
revoke execute on function
  public.groups_week_start(date), public.groups_counts_from(date), public.groups_next_monday(date), public.groups_actor(),
  public.groups_member_role(uuid, uuid), public.groups_lock_admin(uuid, uuid),
  public.groups_validate_info(text, text, text, text), public.groups_validate_commitment(text, text, integer, boolean),
  public.groups_check_habit(uuid, uuid, boolean), public.groups_streak(uuid),
  public.groups_apply_pending(uuid, timestamptz), public.groups_close_week(uuid, date, timestamptz),
  public.groups_close_group(uuid, timestamptz), public.habits_group_guard(), public.profiles_end_group_memberships()
  from public, anon, authenticated;

revoke execute on function
  public.create_group(text, text, text, text, text, text, integer, boolean, uuid),
  public.update_group(uuid, text, text, text, text), public.set_group_commitment(uuid, text, text, integer, boolean),
  public.archive_group(uuid), public.create_group_invite(uuid), public.join_group(text, uuid), public.leave_group(uuid),
  public.remove_group_member(uuid, uuid), public.set_group_admin(uuid, uuid, boolean), public.my_groups(),
  public.group_detail(uuid), public.group_board(uuid), public.group_wall(uuid, timestamptz, uuid, integer),
  public.group_history(uuid, integer), public.group_week_detail(uuid, date), public.group_invite_preview(text),
  public.habit_group_link(uuid), public.group_proof_readable(text), public.close_due_group_weeks(timestamptz)
  from public, anon, authenticated;

grant execute on function
  public.create_group(text, text, text, text, text, text, integer, boolean, uuid),
  public.update_group(uuid, text, text, text, text), public.set_group_commitment(uuid, text, text, integer, boolean),
  public.archive_group(uuid), public.create_group_invite(uuid), public.join_group(text, uuid), public.leave_group(uuid),
  public.remove_group_member(uuid, uuid), public.set_group_admin(uuid, uuid, boolean), public.my_groups(),
  public.group_detail(uuid), public.group_board(uuid), public.group_wall(uuid, timestamptz, uuid, integer),
  public.group_history(uuid, integer), public.group_week_detail(uuid, date),
  -- the invoker-side habit trigger and the storage policy run as the client
  public.habit_group_link(uuid), public.group_proof_readable(text)
  to authenticated;
grant execute on function public.group_invite_preview(text) to anon, authenticated;
grant execute on function public.close_due_group_weeks(timestamptz) to service_role;
