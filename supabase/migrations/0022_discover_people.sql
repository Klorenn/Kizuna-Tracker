-- Discover people (Task 31): suggestions in Amigos and the Explorar page. Additive only.
--
--  1. profiles.discoverable (default true, for every account including existing ones): the owner
--     may update it, nobody else can read or write it, and it is NOT part of public_profiles.
--  2. discover_people(query, limit, offset): the one read behind both the suggestions (no query,
--     first 3) and Explorar (20 per page, optional query). It returns only id, username, display
--     name, avatar, the number of friends in common, the pending-request relation with the caller
--     and a "new" flag. The creation instant itself never leaves the database.
--  3. DELIBERATE DISCLOSURE (owner-approved): mutual_count lets a caller learn that some friend of
--     theirs is a friend of the listed person (with a single friend it identifies the pair). That
--     is the purpose of the feature and it is governed by the switch: a person with
--     discoverable = false is never listed (except for an exact @usuario query) and their
--     friendships are never counted. Nothing else about the social graph is exposed: no names of
--     mutual friends, no friend counts, no rows of friendships. is_friend, public_profiles and the
--     friendships policies are untouched.
--  4. A cap of 20 pending friend requests per requester (trigger, any role). Accepted rows never
--     count, so accept_invite and the accept UPDATE are unaffected.

-- ------------------------------------------------------------------ 1. the switch
alter table public.profiles add column discoverable boolean not null default true;
grant update (discoverable) on public.profiles to authenticated;

-- ------------------------------------------------------------------ search helper
-- lower-case + Spanish accents removed, so "jose" finds "José". No extension needed.
create function public.discover_fold(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.translate(pg_catalog.lower(p_text), 'áéíóúüñ', 'aeiouun');
$$;
revoke execute on function public.discover_fold(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ 2. discover_people
create function public.discover_people(
  p_query text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  avatar_preset smallint,
  mutual_count integer,
  relation text,
  is_new boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_q text;
  v_fq text;
  v_limit integer := greatest(1, least(50, coalesce(p_limit, 20)));
  v_offset integer := greatest(0, least(1000, coalesce(p_offset, 0)));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_q := pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_query, '')), '^@', '')));
  if v_q = '' then
    v_q := null;
  elsif pg_catalog.char_length(v_q) < 2 or pg_catalog.char_length(v_q) > 40 then
    raise exception 'invalid_query';
  end if;
  v_fq := case when v_q is null then null else public.discover_fold(v_q) end;

  -- the caller's own deleted profile gets nothing
  if not exists (select 1 from public.profiles me where me.id = v_uid and me.deleted_at is null) then
    return;
  end if;

  return query
  select
    p.id,
    p.username::text,
    p.display_name,
    p.avatar_path,
    p.avatar_preset,
    m.n,
    case
      when pr.requester_id = v_uid then 'outgoing'
      when pr.requester_id is not null then 'incoming'
      else 'none'
    end,
    p.created_at > pg_catalog.now() - interval '14 days'
  from public.profiles p
  left join lateral (
    select f.requester_id
    from public.friendships f
    where f.status = 'pending'
      and ((f.requester_id = v_uid and f.addressee_id = p.id) or (f.requester_id = p.id and f.addressee_id = v_uid))
    limit 1
  ) pr on true
  cross join lateral (
    -- people who are accepted friends of BOTH, not deleted and discoverable
    select pg_catalog.count(*)::integer as n
    from public.friendships fa
    join public.friendships fb
      on fb.status = 'accepted'
      and (case when fb.requester_id = v_uid then fb.addressee_id else fb.requester_id end)
        = (case when fa.requester_id = p.id then fa.addressee_id else fa.requester_id end)
      and (fb.requester_id = v_uid or fb.addressee_id = v_uid)
    join public.profiles mf
      on mf.id = (case when fa.requester_id = p.id then fa.addressee_id else fa.requester_id end)
      and mf.deleted_at is null
      and mf.discoverable
    where fa.status = 'accepted'
      and (fa.requester_id = p.id or fa.addressee_id = p.id)
  ) m
  where p.deleted_at is null
    and p.id <> v_uid
    and not exists (
      select 1 from public.friendships af
      where af.status = 'accepted'
        and ((af.requester_id = v_uid and af.addressee_id = p.id) or (af.requester_id = p.id and af.addressee_id = v_uid))
    )
    and (p.discoverable or (v_q is not null and p.username::text = v_q))
    and (
      v_q is null
      or pg_catalog.starts_with(p.username::text, v_q)
      or pg_catalog.strpos(public.discover_fold(p.display_name), v_fq) > 0
    )
  order by
    (v_q is not null and p.username::text = v_q) desc,
    m.n desc,
    p.created_at desc,
    p.id
  limit v_limit offset v_offset;
end;
$$;
revoke execute on function public.discover_people(text, integer, integer) from public, anon;
grant execute on function public.discover_people(text, integer, integer) to authenticated;

-- ------------------------------------------------------------------ 4. pending-request cap
create function public.friendships_request_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    -- serialise concurrent requests of the same requester so the count cannot be raced past
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('friend_request_cap:' || new.requester_id::text, 0));
    if (select pg_catalog.count(*) from public.friendships f
        where f.requester_id = new.requester_id and f.status = 'pending') >= 20 then
      raise exception 'request_limit';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.friendships_request_cap() from public, anon, authenticated;
create trigger friendships_request_cap
  before insert on public.friendships
  for each row execute function public.friendships_request_cap();
