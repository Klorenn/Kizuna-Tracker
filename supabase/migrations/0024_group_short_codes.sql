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
--  * 40 bits are guessable only by brute force, so the limits sit where the RPCs are reachable:
--      - group_invite_preview(text) is no longer callable by clients (service_role only). The server calls
--        group_invite_preview_for(code, viewer) with the service key after its own per-address limit; for an ACTIVE member of
--        that live group the answer carries two more keys (member, group_id), for anybody else exactly the nine keys.
--      - join_group counts failed attempts per signed-in person in group_join_attempts: ten in the last hour and the call
--        raises too_many_attempts before looking at the code. Every not-found-class outcome (malformed, unknown, expired,
--        used up, archived, removed-before) records one attempt and RETURNS NULL (an exception would roll the record back);
--        all other outcomes stay exceptions and record nothing. The caller's attempts older than a day are deleted in the call.
--      - rate_limit(key, limit, window, record) is the server's generic limiter (service_role only, SHA-256 digests only).
--    A code longer than 64 characters is "not found" before any other work.

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
stable
set search_path = ''
as $$
declare
  v text;
begin
  -- before any other work: nothing legitimate is longer than 64 characters
  if p_code is null or pg_catalog.char_length(p_code) > 64 then
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

-- Failed join attempts per signed-in person (guessing budget). Written only by join_group.
create table public.group_join_attempts (
  user_id uuid not null references public.profiles (id),
  attempted_at timestamptz not null default now()
);
create index group_join_attempts_user_idx on public.group_join_attempts (user_id, attempted_at);
alter table public.group_join_attempts enable row level security;
revoke all on public.group_join_attempts from public, anon, authenticated;

-- Events of the server's generic limiter. Only a SHA-256 digest of the key is stored (keys contain client addresses).
create table public.rate_limit_events (
  key_hash bytea not null,
  at timestamptz not null default now()
);
create index rate_limit_events_key_idx on public.rate_limit_events (key_hash, at);
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from public, anon, authenticated;

-- true = blocked: the key already has p_limit or more events inside the window. Not blocked and p_record: one event is
-- recorded. p_record false only checks. limit clamped to 1..1000, window to 1..86400 seconds. Same call: the key's events older
-- than a day are deleted and at most 500 other expired rows, so the table cannot grow without bound.
-- GUARANTEE: calls for the SAME key are serialised by a transaction-level advisory lock on the digest, held until the call's
-- transaction ends, so the count and the insert cannot interleave: two parallel calls can never both take the last slot
-- (exact, not marginal), provided each call is its own transaction (as with a PostgREST rpc). Two different keys whose 64-bit
-- lock hashes collide merely wait for each other. Events are stamped with clock_timestamp.
create function public.rate_limit(p_key text, p_limit integer, p_window_seconds integer, p_record boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_limit int := greatest(1, least(1000, coalesce(p_limit, 1)));
  v_window int := greatest(1, least(86400, coalesce(p_window_seconds, 1)));
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_n int;
begin
  if p_key is null then
    raise exception 'invalid_key';
  end if;
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_key, 'UTF8'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.encode(v_hash, 'hex'), 0));
  delete from public.rate_limit_events e where e.key_hash = v_hash and e.at < v_now - interval '1 day';
  delete from public.rate_limit_events e
  where e.ctid in (select x.ctid from public.rate_limit_events x where x.at < v_now - interval '1 day' limit 500);
  select pg_catalog.count(*)::int into v_n from public.rate_limit_events e
  where e.key_hash = v_hash and e.at > v_now - pg_catalog.make_interval(secs => v_window);
  if v_n >= v_limit then
    return true;
  end if;
  if coalesce(p_record, false) then
    insert into public.rate_limit_events (key_hash, at) values (v_hash, v_now);
  end if;
  return false;
end;
$$;
revoke execute on function public.rate_limit(text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.rate_limit(text, integer, integer, boolean) to service_role;

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
  v_code text;
begin
  -- serialises this person's own calls (the attempt count below cannot be raced past; lock order profile -> group -> invite)
  perform 1 from public.profiles p where p.id = v_uid and p.deleted_at is null for no key update;
  delete from public.group_join_attempts a where a.user_id = v_uid and a.attempted_at < pg_catalog.now() - interval '24 hours';
  if (select pg_catalog.count(*) from public.group_join_attempts a
      where a.user_id = v_uid and a.attempted_at > pg_catalog.now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts';
  end if;
  -- anything that is not exactly 8 characters of the alphabet never reaches the invites table
  v_code := public.groups_normalize_code(p_code);
  if v_code is null then
    insert into public.group_join_attempts (user_id) values (v_uid);
    return null;
  end if;
  select i.group_id into v_gid from public.group_invites i where i.code = v_code;
  if not found then
    insert into public.group_join_attempts (user_id) values (v_uid);
    return null;
  end if;
  -- lock order: caller's profile (taken above) -> group -> invite -> habit
  select x.* into g from public.groups x where x.id = v_gid for update;
  if g.archived_at is not null then
    insert into public.group_join_attempts (user_id) values (v_uid);
    return null;
  end if;
  select i.* into v_inv from public.group_invites i where i.code = v_code for update;
  if not found then
    insert into public.group_join_attempts (user_id) values (v_uid);
    return null;
  end if;
  -- someone an admin removed cannot come back with a link made before the removal; no hint is given
  if exists (select 1 from public.group_members m
             where m.group_id = g.id and m.user_id = v_uid and m.left_reason = 'removed' and m.left_at >= v_inv.created_at) then
    insert into public.group_join_attempts (user_id) values (v_uid);
    return null;
  end if;
  if v_inv.expires_at <= pg_catalog.now() or v_inv.uses >= v_inv.max_uses then
    insert into public.group_join_attempts (user_id) values (v_uid);
    return null;
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

-- The server's preview: the nine keys of group_invite_preview and, ONLY when p_viewer is an active member of that live group, two
-- more: member (true) and group_id. p_viewer is trusted because only the service role can call this.
create function public.group_invite_preview_for(p_code text, p_viewer uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := public.groups_normalize_code(p_code);
  v_gid uuid;
  v_result jsonb;
begin
  if v_code is null then
    return null;
  end if;
  select g.id, pg_catalog.jsonb_build_object(
    'name', g.name, 'icon', g.icon, 'color', g.color,
    'commitment_name', g.commitment_name, 'commitment_icon', g.commitment_icon,
    'target_per_week', g.target_per_week, 'requires_photo', g.requires_photo,
    'member_count', n.c, 'full', n.c >= 50)
  into v_gid, v_result
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  cross join lateral (
    select pg_catalog.count(*)::int as c from public.group_members m where m.group_id = g.id and m.left_at is null
  ) n
  where i.code = v_code and i.expires_at > pg_catalog.now() and i.uses < i.max_uses and g.archived_at is null;
  if v_result is null then
    return null;
  end if;
  if p_viewer is not null and exists (
    select 1 from public.group_members m where m.group_id = v_gid and m.user_id = p_viewer and m.left_at is null
  ) then
    v_result := v_result || pg_catalog.jsonb_build_object('member', true, 'group_id', v_gid);
  end if;
  return v_result;
end;
$$;

-- grants: create_group_invite and join_group keep 0023's (authenticated); the preview is no longer reachable by clients
revoke execute on function public.create_group_invite(uuid), public.join_group(text, uuid) from public, anon, authenticated;
grant execute on function public.create_group_invite(uuid), public.join_group(text, uuid) to authenticated;
revoke execute on function public.group_invite_preview(text), public.group_invite_preview_for(text, uuid) from public, anon, authenticated;
grant execute on function public.group_invite_preview(text), public.group_invite_preview_for(text, uuid) to service_role;
