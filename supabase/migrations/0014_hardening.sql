-- Hardening after the whole-branch review. Several table grants and policies from 0002 were
-- assumed closed by later routes and RPCs; this migration closes them at the database, where
-- the real boundary is. Applied migrations are never edited: everything here is additive or a
-- CREATE OR REPLACE of an existing function.

-- ============================================================ service role (review M3)
-- 0012 only covered the tables that existed then. Re-run it (anything added since) and make it
-- the default for every table and sequence postgres creates from now on, so cron, photo
-- check-ins and account deletion never hit 42501 on a new table.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- ============================================================ deleted accounts (review M1)
-- A deleted account keeps a valid JWT until it expires. One statement-level guard on every
-- client-writable table refuses writes made in its name, whatever the path (table grant,
-- policy or SECURITY DEFINER RPC: auth.uid() is the caller in all of them). Server code with
-- the service role has no auth.uid() and is not affected.
create function public.forbid_deleted_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.deleted_at is not null
  ) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return null;
end;
$$;
revoke execute on function public.forbid_deleted_actor() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'friendships', 'invites', 'habits', 'habit_items', 'checkins', 'checkin_items',
    'goals', 'challenges', 'debts', 'notifications', 'push_subscriptions'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I '
      'for each statement execute function public.forbid_deleted_actor()',
      t || '_forbid_deleted_actor', t);
  end loop;
end;
$$;

-- ============================================================ friendships (review I1)
-- Clients may delete only pending rows (decline a request, withdraw one). An accepted
-- friendship ends only through remove_friend, which also cancels the open challenges:
-- deleting it directly used to hide each player's check-ins from the other while their
-- challenge kept billing.
drop policy friendships_delete_parties on public.friendships;
create policy friendships_delete_pending on public.friendships
  for delete to authenticated
  using (
    status = 'pending'
    and (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()))
  );

-- Always cancels the open challenges between the pair, also when the friendship row is
-- already gone (a direct delete before this migration, or any future path). Returns true when
-- something changed: a friendship was removed or open challenges were cancelled.
create or replace function public.remove_friend(p_other uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
  v_open boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.friendships f
  where (f.requester_id = v_uid and f.addressee_id = p_other)
     or (f.requester_id = p_other and f.addressee_id = v_uid);
  get diagnostics v_deleted = row_count;
  v_open := exists (
    select 1 from public.challenges c
    where c.status in ('proposed', 'active')
      and ((c.creator_id = v_uid and c.rival_id = p_other)
        or (c.creator_id = p_other and c.rival_id = v_uid))
  );
  perform public.cancel_challenges_between(p_other);
  return v_deleted > 0 or v_open;
end;
$$;

-- ============================================================ push subscriptions (review I2)
-- The subscribe route validates the endpoint and writes with the service role. Clients keep
-- SELECT and DELETE of their own rows only: a direct INSERT/UPDATE used to store any URL, and
-- the server POSTs to whatever is stored (blind SSRF).
revoke insert, update on public.push_subscriptions from authenticated;

-- Mirror of src/lib/push-endpoint.ts: https, allow-listed push services, no userinfo, default
-- port. Rows planted before this migration are dropped first so the constraint can be added.
delete from public.push_subscriptions
where not (
  char_length(endpoint) <= 2048
  and endpoint ~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9_-]+\.)+push\.apple\.com|([a-z0-9_-]+\.)+notify\.windows\.com)(:443)?([/?#]|$)'
);
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_allowed check (
    char_length(endpoint) <= 2048
    and endpoint ~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9_-]+\.)+push\.apple\.com|([a-z0-9_-]+\.)+notify\.windows\.com)(:443)?([/?#]|$)'
  );

-- ============================================================ usernames (review I3, M2)
-- Account deletion renames the profile to `deleted_<12 hex of the id>`. A live account taking
-- that handle first made the deletion fail half-way, so the prefix is reserved for deleted rows.
alter table public.profiles
  add constraint profiles_username_reserved check (deleted_at is not null or username::text !~ '^deleted_');

-- The app never edits the username, and avatar_path is set by the service-role upload.
revoke update (username, avatar_path) on public.profiles from authenticated;

-- A deleted profile is no longer editable by its own (still valid) token.
drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_username ~ '^[a-z0-9_]{3,20}$'
      and p_username !~ '^deleted_'
      and not exists (
        select 1 from public.profiles p
        where p.username operator(extensions.=) p_username::extensions.citext
      ),
    false
  );
$$;
-- Only the signup server action calls it (with the service role), behind its own throttle;
-- a direct /rest/v1/rpc call used to skip that throttle.
revoke execute on function public.username_available(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to service_role;

-- ============================================================ photo habits and steps (review I4, M4)
-- A step may only be active on a habit that does not ask for a photo (0005 guarded archive and
-- the insert policy, not un-archive), and a habit holds at most 12 active steps, whoever writes
-- the row. AFTER, so RLS refuses a foreign write first; the habit row is locked so this cannot
-- race habits_photo_guard. The count sees every row of the statement, the new one excluded.
create function public.habit_items_activation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requires_photo boolean;
begin
  if new.archived_at is null and (tg_op = 'INSERT' or old.archived_at is not null) then
    select h.requires_photo into v_requires_photo
    from public.habits h
    where h.id = new.habit_id
    for update;
    if v_requires_photo then
      raise exception 'photo_conflict';
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
revoke execute on function public.habit_items_activation_guard() from public, anon, authenticated;
create trigger habit_items_activation_guard
  after insert or update of archived_at on public.habit_items
  for each row execute function public.habit_items_activation_guard();

-- Steps never complete the day of a habit that asks for a photo (that day needs a photo
-- check-in the rival can reject), and only the owner's active habit can be completed.
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
      and h.archived_at is null and not h.requires_photo
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

-- ============================================================ row caps (review I6)
-- PostgREST returns at most max_rows (1000) rows per request. The close-periods cron used to
-- re-read every cancelled challenge on every run, so its working set only grew. The cron stamps
-- settled_at once a cancelled challenge has no period left to bill, and skips it afterwards.
alter table public.challenges add column settled_at timestamptz;
create index challenges_unsettled_idx on public.challenges (id)
  where settled_at is null and status in ('active', 'cancelled');

-- Daily-reminder candidates computed in SQL (one paged read instead of loading every user's
-- check-ins into the app): live users with a push subscription, and whether a habit is still
-- open today in their own timezone. Weekly habits count non-rejected check-ins of the ISO week.
create function public.reminder_candidates()
returns table (user_id uuid, timezone text, reminder_time time, pending_today boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select p.id, p.timezone, p.reminder_time, (pg_catalog.now() at time zone p.timezone)::date as today
    from public.profiles p
    where p.deleted_at is null
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
  )
  select u.id, u.timezone, u.reminder_time,
    exists (
      select 1 from public.habits h
      where h.user_id = u.id
        and h.archived_at is null
        and not exists (
          select 1 from public.checkins c
          where c.habit_id = h.id and c.local_date = u.today and c.rejected_at is null
        )
        and (
          h.frequency_type <> 'weekly'
          or (
            select count(*) from public.checkins c
            where c.habit_id = h.id and c.rejected_at is null
              and c.local_date between u.today - (extract(isodow from u.today)::int - 1)
                                   and u.today - (extract(isodow from u.today)::int - 1) + 6
          ) < coalesce(h.target_per_week, 1)
        )
    )
  from u
  order by u.id;
$$;
revoke execute on function public.reminder_candidates() from public, anon, authenticated;
grant execute on function public.reminder_candidates() to service_role;
