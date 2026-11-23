-- 0019_perf_reads: read-path index and two SECURITY INVOKER read RPCs. Additive only.
--
-- Both RPCs run as the caller, so the existing RLS policies (own rows, accepted friends, no private
-- habits) keep deciding what each caller sees. Neither may become SECURITY DEFINER.

-- Friends feed: top-N per friend in (local_date, created_at, id) descending order.
-- A plain CREATE INDEX takes a SHARE lock on checkins (writes wait) while it builds: fine while the
-- table is small or empty at deploy time. If production already holds real volume, build it
-- CONCURRENTLY out of band first; `if not exists` then makes this a no-op. checkins_user_idx
-- (user_id) is now a redundant prefix of this index; drop it in a later migration once the plans
-- are confirmed in production.
create index if not exists checkins_user_feed_idx
  on public.checkins (user_id, local_date desc, created_at desc, id desc);

-- One row per habit with its non-rejected check-in dates since p_from, newest first. Replaces one
-- query per habit (Perfil, friend profile) and the paged 1000-row reads. RLS decides which habits
-- and check-ins the caller may see, so another user's habit ids simply return nothing.
create function public.checkin_dates(p_habit_ids uuid[], p_from date)
returns table (habit_id uuid, dates date[])
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- the body of a POST has no URL-length cap: bound the work of one call
  if cardinality(p_habit_ids) > 500 then
    raise exception 'too_many_habits' using errcode = 'P0001';
  end if;
  return query
    select c.habit_id, array_agg(c.local_date order by c.local_date desc)
    from public.checkins c
    where c.habit_id = any(p_habit_ids)
      and c.rejected_at is null
      and c.local_date >= p_from
    group by c.habit_id;
end
$$;

-- A page of the friends feed (or of one person's activity with p_owner), newest first, keyset
-- paginated on (local_date, created_at, id). Returns up to p_limit + 1 rows: the extra row tells the
-- caller there is a next page. p_limit is clamped to 1..100 (null means 20). Accepted friends are
-- read first and each one's newest rows come from checkins_user_feed_idx, so the cost follows (friends x page size), not the size of the table.
-- Visibility stays in RLS; the rejected rule mirrors the app: a rejected check-in shows only to its
-- owner and to whoever rejected it.
create function public.friend_feed(
  p_limit int,
  p_cursor_day date default null,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_photos_only boolean default false,
  p_owner uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  habit_id uuid,
  local_date date,
  created_at timestamptz,
  photo_path text,
  rejected_at timestamptz,
  rejected_by uuid,
  habit_name text,
  habit_color text,
  habit_frequency_type text,
  habit_target_per_week int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  people as (
    select p_owner as uid where p_owner is not null
    union all
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end
    from public.friendships f, me
    where p_owner is null
      and f.status = 'accepted'
      and (f.requester_id = me.id or f.addressee_id = me.id)
  ),
  picked as (
    select k.*
    from people
    cross join lateral (
      select c.id, c.user_id, c.habit_id, c.local_date, c.created_at, c.photo_path, c.rejected_at, c.rejected_by
      from public.checkins c, me
      where c.user_id = people.uid
        and (not p_photos_only or c.photo_path is not null)
        and (c.user_id = me.id or c.rejected_at is null or c.rejected_by = me.id)
        and (p_cursor_day is null
             or (c.local_date, c.created_at, c.id) < (p_cursor_day, p_cursor_at, p_cursor_id))
      order by c.local_date desc, c.created_at desc, c.id desc
      limit least(greatest(coalesce(p_limit, 20), 1), 100) + 1
    ) k
    order by k.local_date desc, k.created_at desc, k.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100) + 1
  )
  select k.id, k.user_id, k.habit_id, k.local_date, k.created_at, k.photo_path, k.rejected_at, k.rejected_by,
         h.name, h.color, h.frequency_type, h.target_per_week
  from picked k
  left join public.habits h on h.id = k.habit_id
  order by k.local_date desc, k.created_at desc, k.id desc
$$;

revoke execute on function public.checkin_dates(uuid[], date) from public, anon;
revoke execute on function public.friend_feed(int, date, timestamptz, uuid, boolean, uuid) from public, anon;
grant execute on function public.checkin_dates(uuid[], date) to authenticated;
grant execute on function public.friend_feed(int, date, timestamptz, uuid, boolean, uuid) to authenticated;

comment on function public.checkin_dates(uuid[], date) is
  'One row per habit with its non-rejected check-in dates since p_from, newest first. SECURITY INVOKER: RLS decides which habits and check-ins the caller sees. At most 500 habit ids per call (P0001 too_many_habits).';
comment on function public.friend_feed(int, date, timestamptz, uuid, boolean, uuid) is
  'Keyset page of the friends feed (or of one person with p_owner), newest first, p_limit clamped to 1..100 and returned as p_limit + 1 rows. SECURITY INVOKER: RLS decides visibility; a rejected check-in shows only to its owner and to whoever rejected it.';
