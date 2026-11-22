-- RLS + grants. Supabase grants ALL on new public tables to anon/authenticated by
-- default; start from zero and grant only what each table needs (column-level
-- where a role may touch only some columns). RLS then filters rows.

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.invites enable row level security;
alter table public.habits enable row level security;
alter table public.checkins enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_periods enable row level security;
alter table public.debts enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;
grant execute on function public.is_friend(uuid, uuid) to authenticated;
-- trigger function: never called directly by clients
revoke execute on function public.checkins_mark_duplicate() from authenticated;

-- ---------------------------------------------------------------- profiles
-- Base table: owner only (timezone, reminder_time, is_adult are private).
-- Everyone else reads the 4-column public_profiles view.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant insert (id, username, display_name, avatar_path, timezone, reminder_time, is_adult)
  on public.profiles to authenticated;
-- deleted_at is server-managed (account deletion flow)
grant update (username, display_name, avatar_path, timezone, reminder_time)
  on public.profiles to authenticated;

-- Design choice: a plain (security definer) view owned by postgres, so it bypasses
-- the owner-only RLS on profiles but can only ever project these 4 columns.
-- security_invoker would re-apply profiles RLS and break @username search.
-- anon gets nothing; authenticated can read it.
create view public.public_profiles as
  select id, username, display_name, avatar_path from public.profiles;
-- views get default grants (incl. INSERT/UPDATE on an auto-updatable view): strip them
revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- ------------------------------------------------------------ friendships
create policy friendships_select_parties on public.friendships
  for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
create policy friendships_insert_requester on public.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
-- only the addressee can accept, and only pending -> accepted
create policy friendships_update_addressee on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status = 'accepted');
create policy friendships_delete_parties on public.friendships
  for delete to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
grant select, delete on public.friendships to authenticated;
grant insert (requester_id, addressee_id, status) on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;

-- ---------------------------------------------------------------- invites
-- Owner only. Redeeming a code by a stranger goes through a SECURITY DEFINER RPC
-- (later task), so codes can't be enumerated.
create policy invites_owner on public.invites
  for all to authenticated
  using (inviter_id = (select auth.uid())) with check (inviter_id = (select auth.uid()));
grant select, delete on public.invites to authenticated;
grant insert (code, inviter_id, expires_at) on public.invites to authenticated;

-- ----------------------------------------------------------------- habits
create policy habits_select_owner_or_friend on public.habits
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend((select auth.uid()), user_id));
create policy habits_insert_owner on public.habits
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy habits_update_owner on public.habits
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy habits_delete_owner on public.habits
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.habits to authenticated;
grant insert (user_id, name, icon, frequency_type, target_per_week, requires_photo)
  on public.habits to authenticated;
grant update (name, icon, frequency_type, target_per_week, requires_photo, archived_at)
  on public.habits to authenticated;

-- --------------------------------------------------------------- checkins
-- rejected_at/by/reason and is_duplicate are NOT in any owner grant: rejection
-- goes through the reject_checkin RPC (Task 9, security definer) and the
-- duplicate flag is computed by the checkins_mark_duplicate trigger.
create policy checkins_select_owner_or_friend on public.checkins
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend((select auth.uid()), user_id));
create policy checkins_insert_owner on public.checkins
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = (select auth.uid())
    )
  );
create policy checkins_update_owner on public.checkins
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- undo is allowed only while the check-in has not been rejected
create policy checkins_delete_owner on public.checkins
  for delete to authenticated
  using (user_id = (select auth.uid()) and rejected_at is null);
grant select, delete on public.checkins to authenticated;
grant insert (habit_id, user_id, local_date, photo_path, photo_sha256)
  on public.checkins to authenticated;
grant update (photo_path, photo_sha256) on public.checkins to authenticated;

-- ------------------------------------------------------------- challenges
-- Readable by participants (independent of friendship). Creator may propose
-- against an accepted friend; all later transitions go through RPCs.
create policy challenges_select_participants on public.challenges
  for select to authenticated
  using (creator_id = (select auth.uid()) or rival_id = (select auth.uid()));
create policy challenges_insert_creator on public.challenges
  for insert to authenticated
  with check (
    creator_id = (select auth.uid())
    and status = 'proposed'
    and public.is_friend((select auth.uid()), rival_id)
    and exists (
      select 1 from public.habits h
      where h.id = creator_habit_id and h.user_id = (select auth.uid())
    )
  );
grant select on public.challenges to authenticated;
grant insert (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week,
              requires_photo, weeks, fine_amount, timezone)
  on public.challenges to authenticated;

create policy challenge_periods_select_participants on public.challenge_periods
  for select to authenticated
  using (exists (
    select 1 from public.challenges c
    where c.id = challenge_id
      and (c.creator_id = (select auth.uid()) or c.rival_id = (select auth.uid()))
  ));
grant select on public.challenge_periods to authenticated;

-- ------------------------------------------------------------------ debts
-- Debtor and creditor read. The only client write is paid_at, by the creditor.
create policy debts_select_parties on public.debts
  for select to authenticated
  using (debtor_id = (select auth.uid()) or creditor_id = (select auth.uid()));
create policy debts_update_creditor on public.debts
  for update to authenticated
  using (creditor_id = (select auth.uid())) with check (creditor_id = (select auth.uid()));
grant select on public.debts to authenticated;
grant update (paid_at) on public.debts to authenticated;

-- ---------------------------------------------------------- notifications
-- Created server-side; owner reads, marks read, deletes.
create policy notifications_owner on public.notifications
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ------------------------------------------------------ push_subscriptions
create policy push_subscriptions_owner on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, delete on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth) on public.push_subscriptions to authenticated;
grant update (endpoint, p256dh, auth) on public.push_subscriptions to authenticated;
