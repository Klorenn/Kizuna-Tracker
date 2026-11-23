-- Short invitation codes (Task 38). The owner asked for codes that are easy to type, so an invitation is now 8 characters
-- from 23456789ABCDEFGHJKLMNPQRSTUVWXYZ (no 0, 1, I, O), canonical form upper case without a separator. Additive on top of
-- 0023 (applied and frozen): three functions are replaced (create or replace), one helper pair is new, one constraint is new.
--
--  * groups_random_invite_code(): 8 bytes from extensions.gen_random_bytes, each byte masked with 31. 256 is a multiple of 32,
--    so every symbol is exactly as likely as any other (no modulo bias, no rejection loop needed).
--  * groups_normalize_code(text): removes every whitespace character and at most one hyphen, upper-cases, and returns the
--    canonical code only when it is exactly 8 characters of the alphabet; otherwise null. The shape is checked on the ASCII
--    letters BEFORE upper-casing, so no Unicode letter can fold into the alphabet.
--  * create_group_invite: same behaviour as 0023 (newest still-valid invite made after the most recent removal is returned,
--    else one is minted; same limits and errors), but it only ever reuses and mints the short shape. A still-valid invite in
--    the old 32-hex shape is expired and a short one minted. A collision (unique violation) generates again, at most 8 times,
--    then invite_unavailable.
--  * group_invite_preview / join_group: the input is normalised first. Anything that is not exactly 8 alphabet characters is
--    "not found" (null / invite_not_found) without touching the table. Everything else is 0023 verbatim: returned keys,
--    errors, removal rule, notifications, limits, lock order. Old 32-hex invites can no longer be used or previewed.
--  * CONSTRAINT CHOICE: group_invites_code_shape accepts EITHER shape (short upper-case or the old 32 lower-case hex), so
--    rows that already exist, here or on the hosted project, never block the migration, while nothing else can be inserted.
--    The column default (random 32 hex) is dropped: only the functions produce codes, and they only produce the short one.
--  * 40 bits are guessable only by brute force, so the safety is a call budget, which the app adds (attempt limits per
--    person and per address). The database does not make guessing cheaper than one lookup per call: the anonymous preview
--    answers null in every failing case, and join_group answers exactly what 0023 answered a signed-in caller (not found,
--    expired / used up, already a member, ...). A malformed code is rejected before any lookup, which reveals nothing: the
--    shape is public.

create function public.groups_random_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := '';
begin
  for i in 0..7 loop
    v_code := v_code || pg_catalog.substr(v_alphabet, (pg_catalog.get_byte(v_bytes, i) & 31) + 1, 1);
  end loop;
  return v_code;
end;
$$;

create function public.groups_normalize_code(p_code text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_code is null then
    return null;
  end if;
  v := pg_catalog.regexp_replace(p_code, '\s', '', 'g');
  if pg_catalog.char_length(v) - pg_catalog.char_length(pg_catalog.replace(v, '-', '')) > 1 then
    return null;
  end if;
  v := pg_catalog.replace(v, '-', '');
  if v !~ '^[2-9A-HJ-NP-Za-hj-np-z]{8}$' then
    return null;
  end if;
  return pg_catalog.upper(v);
end;
$$;
revoke execute on function public.groups_random_invite_code(), public.groups_normalize_code(text) from public, anon, authenticated;

alter table public.group_invites alter column code drop default;
alter table public.group_invites add constraint group_invites_code_shape
  check (code ~ '^[2-9A-HJ-NP-Z]{8}$' or code ~ '^[0-9a-f]{32}$');

create or replace function public.create_group_invite(p_group_id uuid)
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
  v_try int;
begin
  g := public.groups_lock_admin(v_uid, p_group_id);
  v_free := 50 - (select pg_catalog.count(*) from public.group_members m where m.group_id = g.id and m.left_at is null)::int;
  if v_free <= 0 then
    raise exception 'group_full';
  end if;
  -- an invite in the old 32-hex shape is retired: expired now, and a short one is minted instead
  update public.group_invites i set expires_at = pg_catalog.now()
  where i.group_id = g.id and i.code ~ '^[0-9a-f]{32}$' and i.expires_at > pg_catalog.now() and i.uses < i.max_uses;
  -- the newest invite that is still valid and was made after the last removal in the group is returned as it is: sharing
  -- the link again must not burn the cap of five
  select i.code into v_code
  from public.group_invites i
  where i.group_id = g.id and i.expires_at > pg_catalog.now() and i.uses < i.max_uses
    and i.code ~ '^[2-9A-HJ-NP-Z]{8}$'
    and i.created_at > coalesce((select pg_catalog.max(m.left_at) from public.group_members m
                                 where m.group_id = g.id and m.left_reason = 'removed'), '-infinity'::timestamptz)
  order by i.created_at desc, i.code
  limit 1;
  if v_code is not null then
    return v_code;
  end if;
  if (select pg_catalog.count(*) from public.group_invites i
      where i.group_id = g.id and i.expires_at > pg_catalog.now() and i.uses < i.max_uses) >= 5 then
    raise exception 'invite_limit';
  end if;
  -- 40 random bits: a collision is possible (not likely); generate again, a bounded number of times
  for v_try in 1..8 loop
    v_code := public.groups_random_invite_code();
    begin
      insert into public.group_invites (code, group_id, created_by, max_uses) values (v_code, g.id, v_uid, v_free);
      return v_code;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  raise exception 'invite_unavailable';
end;
$$;

create or replace function public.group_invite_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_code text := public.groups_normalize_code(p_code);
begin
  -- anything that is not exactly 8 characters of the alphabet never reaches the table
  if v_code is null then
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
  where i.code = v_code and i.expires_at > pg_catalog.now() and i.uses < i.max_uses and g.archived_at is null;
  return v_result;
end;
$$;

create or replace function public.join_group(p_code text, p_habit_id uuid)
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
  v_code text := public.groups_normalize_code(p_code);
begin
  -- anything that is not exactly 8 characters of the alphabet never reaches the table
  if v_code is null then
    raise exception 'invite_not_found';
  end if;
  select i.group_id into v_gid from public.group_invites i where i.code = v_code;
  if not found then
    raise exception 'invite_not_found';
  end if;
  -- lock order: caller's profile -> group -> invite -> habit
  perform 1 from public.profiles p where p.id = v_uid and p.deleted_at is null for no key update;
  select x.* into g from public.groups x where x.id = v_gid for update;
  if g.archived_at is not null then
    raise exception 'invite_not_found';
  end if;
  select i.* into v_inv from public.group_invites i where i.code = v_code for update;
  if not found then
    raise exception 'invite_not_found';
  end if;
  -- someone an admin removed cannot come back with a link made before the removal; no hint is given
  if exists (select 1 from public.group_members m
             where m.group_id = g.id and m.user_id = v_uid and m.left_reason = 'removed' and m.left_at >= v_inv.created_at) then
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

-- create or replace keeps the grants of 0023 (authenticated for create_group_invite and join_group, anon and authenticated for
-- the preview); restated so the file stands on its own.
revoke execute on function public.create_group_invite(uuid), public.join_group(text, uuid), public.group_invite_preview(text) from public, anon, authenticated;
grant execute on function public.create_group_invite(uuid), public.join_group(text, uuid) to authenticated;
grant execute on function public.group_invite_preview(text) to anon, authenticated;
