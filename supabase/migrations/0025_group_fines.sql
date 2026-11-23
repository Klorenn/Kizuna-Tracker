-- Group fines (Task 39, step 4 of docs/superpowers/specs/2026-11-23-grupos-design.md): an optional fine per missed week,
-- owed to the group's fund, agreed by at least half of the group; admins mark debts as paid; admins may reject a photo.
-- The app only RECORDS debts: it never moves money. No app code here.
--
-- HOW IT IS BUILT
--  * Five new tables (group_fines, group_fine_votes, group_fine_members, group_fund_debts, group_checkin_rejections). Row
--    level security is on; they have NO policy and NO grant for anon or authenticated. Everything goes through SECURITY
--    DEFINER functions with search_path = '', fully qualified names, the caller taken only from (select auth.uid()),
--    membership and role checked FIRST, no dynamic SQL. A non-member (or someone who left) gets group_not_found.
--  * group_weeks gains fine_id and fine_amount: every closed week snapshots the fine in force, so later changes never
--    rewrite a closed week and a superseded fine's amount never leaks into later weeks.
--  * REPLACED with create or replace, everything else they do kept word for word: groups_close_week (snapshot of the fine,
--    who was bound, one debt per bound member who did not comply, and a fix so that a member who leaves and comes back inside
--    one week is evaluated on all their check-ins), groups_close_group (expires stale proposals of THIS group, group row
--    first), close_due_group_weeks (also lists groups that only have a stale proposal) and group_proof_readable (a second,
--    narrow branch so an admin can open a photo rejected through the group while the rejection can still be undone; the
--    existing branch is kept exactly). Their revokes and grants are stated again at the end. Nothing else of 0023 or 0024
--    is touched; create_group_invite, the previews, join_group and rate_limit are not modified.
--  * groups.admin_reduced_at (set by a trigger when an admin stops being one) and group_week_results.bound (who the fine
--    bound that week, written when the week closes) are new columns. No existing function's shape changes.
--  * two service-role functions for the public invitation page: group_invite_fine_for (the fine shown on the invitation) and
--    group_invite_lookup (one atomic "look up and count failures" call that shares rate_limit's table and hashed key).
--
-- LIFE OF A FINE
--  * propose (admin, amount 1..100000, purpose 1..80): one open proposal per group, valid 7 days, eligible_count = active
--    members at that moment. The proposer's vote counts as an acceptance. It becomes active the moment the acceptances of
--    CURRENT active members reach ceil(eligible_count / 2) (with 1 or 2 members the proposer alone is enough), from the next
--    Monday in the group's zone; a previously active fine becomes superseded and ends that same Monday. Everyone whose
--    acceptance counts is bound from that Monday. A vote can be changed until the decision. A vote of someone who left
--    (or who left and came back after voting) is ignored.
--  * accept later / step out: both from the next Monday, never retroactive. ends: an admin, from the next Monday, no vote.
--  * Monday boundaries: group_fine_members.bound_from / bound_until and group_fines.starts_on / ends_on are Mondays, so
--    "bound for the whole week" is a simple comparison and a person is never bound for part of a week. A week W is covered
--    by the fine with starts_on <= W and (ends_on is null or W < ends_on).
--  * a debt exists for a week when the member has a result row for it (counted or not: a member who left DURING the week keeps
--    an uncounted row and is still evaluated), did not comply, and was bound for the whole week. Members removed by an admin
--    or whose account was deleted have no row, so no debt. Debts of deleted accounts are not created; recorded ones stay.
--
-- PHOTO REJECTION. checkins.reject_reason only accepts the four challenge codes, so a group rejection stores 'other' there
-- and the free-text reason in group_checkin_rejections. That table is also what tells a group rejection from a challenge
-- rejection: only a recorded group rejection can be undone through the group function. The reason is returned only to the
-- photo's owner and to admins (group_rejected_checkins) and sent only to the owner.
--
-- LOCK ORDER (consistent with 0023: profile -> group -> invite -> habit -> member rows). Every fine write takes the GROUP row
-- FOR UPDATE first, then the fine row FOR UPDATE, then vote / binding / debt rows. Votes therefore serialise per group: of two
-- votes racing for the threshold the second finds the fine already active and gets fine_closed, so activation, binding,
-- supersede and the notification happen exactly once. The closing function never locks a fine row before the group row:
-- per group it takes the per-group TRY advisory lock (never waits), then the group row FOR UPDATE, and only then expires that
-- group's stale proposals (the group row is locked only when there is a stale proposal) and closes its weeks. Rejecting or
-- undoing a photo takes the SAME advisory lock first (waiting for it), then the group row, so a rejection and the closing of
-- its week exclude each other (the closer skips the group for that run, or the rejection waits and then sees the closed
-- week). The advisory lock always comes before the group row, in both. Debts are written in the same transaction as the week
-- row from rows that carry their own snapshot (group_week_results.bound), with the unique key (group_id, week_start,
-- debtor_id) and ON CONFLICT DO NOTHING behind it, and a notification only for a row really inserted. The known transient
-- cycle of 0023 (account deletion against join_group or the closer, retryable) is unchanged.

-- ================================================================== 1. tables
create table public.group_fines (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  amount int not null constraint group_fines_amount_range check (amount between 1 and 100000),
  purpose text not null constraint group_fines_purpose_len check (char_length(purpose) between 1 and 80),
  proposed_by uuid not null references public.profiles (id),
  proposed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  eligible_count int not null constraint group_fines_eligible_check check (eligible_count >= 1),
  status text not null default 'proposed'
    constraint group_fines_status_check check (status in ('proposed', 'active', 'expired', 'ended', 'superseded')),
  starts_on date constraint group_fines_starts_monday check (extract(isodow from starts_on) = 1),
  ends_on date constraint group_fines_ends_monday check (extract(isodow from ends_on) = 1),
  decided_at timestamptz,
  constraint group_fines_expires_7d check (expires_at = proposed_at + interval '7 days'),
  constraint group_fines_dates_shape check (
    (status in ('proposed', 'expired') and starts_on is null and ends_on is null)
    or (status = 'active' and starts_on is not null and ends_on is null)
    or (status in ('ended', 'superseded') and starts_on is not null and ends_on is not null and ends_on >= starts_on)
  )
);
create unique index group_fines_one_open_key on public.group_fines (group_id) where status = 'proposed';
create unique index group_fines_one_active_key on public.group_fines (group_id) where status = 'active';
create index group_fines_group_idx on public.group_fines (group_id, starts_on);
create index group_fines_proposed_by_idx on public.group_fines (proposed_by);
create index group_fines_expiry_idx on public.group_fines (expires_at) where status = 'proposed';

create table public.group_fine_votes (
  fine_id uuid not null references public.group_fines (id),
  user_id uuid not null references public.profiles (id),
  accepted boolean not null,
  voted_at timestamptz not null default now(),
  primary key (fine_id, user_id)
);
create index group_fine_votes_user_idx on public.group_fine_votes (user_id);

create table public.group_fine_members (
  group_id uuid not null references public.groups (id),
  fine_id uuid not null references public.group_fines (id),
  user_id uuid not null references public.profiles (id),
  bound_from date not null constraint group_fine_members_from_monday check (extract(isodow from bound_from) = 1),
  bound_until date constraint group_fine_members_until_monday check (extract(isodow from bound_until) = 1),
  primary key (fine_id, user_id, bound_from),
  constraint group_fine_members_order check (bound_until is null or bound_until > bound_from)
);
create unique index group_fine_members_open_key on public.group_fine_members (fine_id, user_id) where bound_until is null;
create index group_fine_members_group_user_idx on public.group_fine_members (group_id, user_id);
create index group_fine_members_user_idx on public.group_fine_members (user_id);

create table public.group_fund_debts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  fine_id uuid not null references public.group_fines (id),
  week_start date not null constraint group_fund_debts_monday check (extract(isodow from week_start) = 1),
  debtor_id uuid not null references public.profiles (id),
  amount int not null constraint group_fund_debts_amount_range check (amount between 1 and 100000),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by uuid references public.profiles (id),
  constraint group_fund_debts_one_per_week unique (group_id, week_start, debtor_id),
  constraint group_fund_debts_paid_pair check ((paid_at is null) = (paid_by is null))
);
create index group_fund_debts_debtor_idx on public.group_fund_debts (debtor_id) where paid_at is null;
create index group_fund_debts_fine_idx on public.group_fund_debts (fine_id);
create index group_fund_debts_paid_by_idx on public.group_fund_debts (paid_by) where paid_by is not null;

-- A rejection made through the group function (see the header). The check-in row keeps rejected_at / rejected_by.
create table public.group_checkin_rejections (
  checkin_id uuid primary key references public.checkins (id) on delete cascade,
  group_id uuid not null references public.groups (id),
  rejected_by uuid not null references public.profiles (id),
  reason text not null constraint group_checkin_rejections_reason_len check (char_length(reason) between 1 and 140),
  rejected_at timestamptz not null default now()
);
create index group_checkin_rejections_group_idx on public.group_checkin_rejections (group_id);
create index group_checkin_rejections_by_idx on public.group_checkin_rejections (rejected_by);

-- when an admin last stopped being one (demoted, left, removed, account deleted): see set_group_debt_paid
alter table public.groups add column admin_reduced_at timestamptz;
-- who the fine bound that week, written when the week closes (true for every member the fine bound for the whole week)
alter table public.group_week_results add column bound boolean not null default false;

alter table public.group_weeks
  add column fine_id uuid references public.group_fines (id),
  add column fine_amount int,
  add constraint group_weeks_fine_pair check ((fine_id is null) = (fine_amount is null));
create index group_weeks_fine_idx on public.group_weeks (fine_id) where fine_id is not null;

alter table public.group_fines enable row level security;
alter table public.group_fine_votes enable row level security;
alter table public.group_fine_members enable row level security;
alter table public.group_fund_debts enable row level security;
alter table public.group_checkin_rejections enable row level security;
revoke all on public.group_fines, public.group_fine_votes, public.group_fine_members, public.group_fund_debts,
  public.group_checkin_rejections from public, anon, authenticated;

create trigger group_fines_forbid_deleted_actor before insert or update or delete on public.group_fines
  for each statement execute function public.forbid_deleted_actor();
create trigger group_fine_votes_forbid_deleted_actor before insert or update or delete on public.group_fine_votes
  for each statement execute function public.forbid_deleted_actor();
create trigger group_fine_members_forbid_deleted_actor before insert or update or delete on public.group_fine_members
  for each statement execute function public.forbid_deleted_actor();
create trigger group_fund_debts_forbid_deleted_actor before insert or update or delete on public.group_fund_debts
  for each statement execute function public.forbid_deleted_actor();
create trigger group_checkin_rejections_forbid_deleted_actor before insert or update or delete on public.group_checkin_rejections
  for each statement execute function public.forbid_deleted_actor();

-- ================================================================== 2. helpers (never callable by clients)
-- Acceptances that count toward the threshold: accepted votes of CURRENT active members who were already members when the
-- proposal was made (the number they are compared with, eligible_count, counted those), cast during their current membership.
-- A member who joined later may still vote (and is bound if it passes) but cannot tip the vote.
create function public.groups_fine_accepted(p_fine_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::int
  from public.group_fine_votes v
  join public.group_fines f on f.id = v.fine_id
  join public.group_members m on m.group_id = f.group_id and m.user_id = v.user_id and m.left_at is null
  where v.fine_id = p_fine_id and v.accepted and v.voted_at >= m.joined_at and m.joined_at <= f.proposed_at;
$$;

-- The fine in force for a week: starts_on <= week and (ends_on is null or week < ends_on).
create function public.groups_fine_for_week(p_group_id uuid, p_week date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.id from public.group_fines f
  where f.group_id = p_group_id and f.status in ('active', 'ended', 'superseded')
    and f.starts_on <= p_week and (f.ends_on is null or p_week < f.ends_on)
  order by f.starts_on desc, f.id
  limit 1;
$$;

-- Expires the proposals past their time (one group, or every group when p_group_id is null) and tells the active members once.
-- The callers hold the group row (propose, the per-group close), so no vote can be in progress for these fines.
create function public.groups_expire_fines(p_group_id uuid, p_now timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  with c as (
    select f.id from public.group_fines f
    where f.status = 'proposed' and f.expires_at <= p_now and (p_group_id is null or f.group_id = p_group_id)
    order by f.id
    for update
  ), u as (
    update public.group_fines f set status = 'expired', decided_at = p_now
    from c where f.id = c.id and f.status = 'proposed'
    returning f.id, f.group_id, f.amount
  )
  insert into public.notifications (user_id, type, payload)
  select m.user_id, 'group_fine_expired',
         pg_catalog.jsonb_build_object('group_id', g.id, 'group_name', g.name, 'amount', u.amount)
  from u
  join public.groups g on g.id = u.group_id and g.archived_at is null
  join public.group_members m on m.group_id = g.id and m.left_at is null
  join public.profiles p on p.id = m.user_id and p.deleted_at is null;
$$;

-- Activates a proposal. The caller holds the group row and the fine row FOR UPDATE.
create function public.groups_fine_activate(p_fine_id uuid, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.group_fines;
  g public.groups;
  v_s date;
  v_prev uuid;
begin
  select x.* into f from public.group_fines x where x.id = p_fine_id;
  select x.* into g from public.groups x where x.id = f.group_id;
  v_s := public.groups_next_monday((p_now at time zone g.timezone)::date);
  -- the fine in force (if any) ends the same Monday; its bindings end then too (those that never began are dropped)
  select x.id into v_prev from public.group_fines x where x.group_id = g.id and x.status = 'active' and x.id <> f.id;
  if v_prev is not null then
    update public.group_fines x set status = 'superseded', ends_on = v_s where x.id = v_prev;
    delete from public.group_fine_members b where b.fine_id = v_prev and b.bound_until is null and b.bound_from >= v_s;
    update public.group_fine_members b set bound_until = v_s where b.fine_id = v_prev and b.bound_until is null;
  end if;
  update public.group_fines x set status = 'active', starts_on = v_s, decided_at = p_now where x.id = f.id;
  insert into public.group_fine_members (group_id, fine_id, user_id, bound_from)
  select f.group_id, f.id, v.user_id, v_s
  from public.group_fine_votes v
  join public.group_members m on m.group_id = f.group_id and m.user_id = v.user_id and m.left_at is null
  where v.fine_id = f.id and v.accepted and v.voted_at >= m.joined_at;
  insert into public.notifications (user_id, type, payload)
  select m.user_id, 'group_fine_active', pg_catalog.jsonb_build_object('group_id', g.id, 'group_name', g.name, 'amount', f.amount)
  from public.group_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  where m.group_id = g.id and m.left_at is null;
end;
$$;

-- A member who leaves, is removed or whose account is deleted stops being bound from the next Monday (the running week is
-- still evaluated). A binding that had not begun is dropped. Runs inside the membership change, under the group row lock.
create function public.groups_end_fine_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_until date;
begin
  select g.timezone into v_tz from public.groups g where g.id = new.group_id;
  v_until := public.groups_next_monday((new.left_at at time zone v_tz)::date);
  delete from public.group_fine_members b
  where b.group_id = new.group_id and b.user_id = new.user_id and b.bound_until is null and b.bound_from >= v_until;
  update public.group_fine_members b set bound_until = v_until
  where b.group_id = new.group_id and b.user_id = new.user_id and b.bound_until is null;
  return null;
end;
$$;
create trigger group_members_end_fine_binding
  after update of left_at on public.group_members
  for each row when (old.left_at is null and new.left_at is not null)
  execute function public.groups_end_fine_binding();

-- Remembers when an admin last stopped being one. Runs inside the membership change, under the group row lock (set_group_admin,
-- leave_group, remove_group_member and the account deletion trigger all hold it).
create function public.groups_note_admin_reduced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.groups g set admin_reduced_at = pg_catalog.clock_timestamp() where g.id = new.group_id;
  return null;
end;
$$;
create trigger group_members_note_admin_reduced
  after update of role, left_at on public.group_members
  for each row when (old.role = 'admin' and old.left_at is null and (new.role <> 'admin' or new.left_at is not null))
  execute function public.groups_note_admin_reduced();

-- ================================================================== 3. write RPCs
create function public.propose_group_fine(p_group_id uuid, p_amount integer, p_purpose text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  v_purpose text := pg_catalog.btrim(p_purpose);
  v_members int;
  v_id uuid;
begin
  g := public.groups_lock_admin(v_uid, p_group_id);
  if p_amount is null or p_amount not between 1 and 100000
     or v_purpose is null or pg_catalog.char_length(v_purpose) not between 1 and 80 or v_purpose ~ '[[:cntrl:]]' then
    raise exception 'invalid_fine';
  end if;
  perform public.groups_expire_fines(g.id, pg_catalog.now());
  if exists (select 1 from public.group_fines f where f.group_id = g.id and f.status = 'proposed') then
    raise exception 'fine_pending';
  end if;
  select pg_catalog.count(*)::int into v_members from public.group_members m where m.group_id = g.id and m.left_at is null;
  begin
    insert into public.group_fines (group_id, amount, purpose, proposed_by, eligible_count)
    values (g.id, p_amount, v_purpose, v_uid, v_members)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'fine_pending';
  end;
  insert into public.group_fine_votes (fine_id, user_id, accepted) values (v_id, v_uid, true);
  if public.groups_fine_accepted(v_id) >= (v_members + 1) / 2 then
    perform public.groups_fine_activate(v_id, pg_catalog.now());
  else
    insert into public.notifications (user_id, type, payload)
    select m.user_id, 'group_fine_proposed',
           pg_catalog.jsonb_build_object('group_id', g.id, 'group_name', g.name, 'amount', p_amount, 'purpose', v_purpose)
    from public.group_members m
    join public.profiles p on p.id = m.user_id and p.deleted_at is null
    where m.group_id = g.id and m.left_at is null and m.user_id <> v_uid;
  end if;
  return v_id;
end;
$$;

create function public.vote_group_fine(p_fine_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  v_gid uuid;
  g public.groups;
  f public.group_fines;
  v_role text;
begin
  if p_accept is null then
    raise exception 'invalid_fine';
  end if;
  select x.group_id into v_gid from public.group_fines x where x.id = p_fine_id;
  if not found then
    raise exception 'fine_not_found';
  end if;
  if public.groups_member_role(v_uid, v_gid) is null then
    raise exception 'group_not_found';
  end if;
  -- lock order: group row, then fine row
  select x.* into g from public.groups x where x.id = v_gid for update;
  v_role := public.groups_member_role(v_uid, v_gid);
  if v_role is null then
    raise exception 'group_not_found';
  end if;
  if g.archived_at is not null then
    raise exception 'group_archived';
  end if;
  select x.* into f from public.group_fines x where x.id = p_fine_id for update;
  if f.status <> 'proposed' or f.expires_at <= pg_catalog.now() then
    raise exception 'fine_closed';
  end if;
  insert into public.group_fine_votes (fine_id, user_id, accepted, voted_at)
  values (f.id, v_uid, p_accept, pg_catalog.now())
  on conflict (fine_id, user_id) do update set accepted = excluded.accepted, voted_at = excluded.voted_at;
  if p_accept and public.groups_fine_accepted(f.id) >= (f.eligible_count + 1) / 2 then
    perform public.groups_fine_activate(f.id, pg_catalog.now());
  end if;
end;
$$;

create function public.accept_group_fine(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  f public.group_fines;
  v_today date;
  v_row public.group_fine_members;
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  select x.* into g from public.groups x where x.id = p_group_id for update;
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  if g.archived_at is not null then
    raise exception 'group_archived';
  end if;
  select x.* into f from public.group_fines x where x.group_id = g.id and x.status = 'active' for update;
  if not found then
    raise exception 'no_active_fine';
  end if;
  v_today := (pg_catalog.now() at time zone g.timezone)::date;
  if exists (select 1 from public.group_fine_members b where b.fine_id = f.id and b.user_id = v_uid and b.bound_until is null) then
    raise exception 'already_bound';
  end if;
  -- stepped out but still bound until that Monday: changing their mind just cancels the step out
  select b.* into v_row from public.group_fine_members b
  where b.fine_id = f.id and b.user_id = v_uid and b.bound_until > v_today
  order by b.bound_from desc limit 1;
  if found then
    update public.group_fine_members b set bound_until = null
    where b.fine_id = v_row.fine_id and b.user_id = v_row.user_id and b.bound_from = v_row.bound_from;
    return;
  end if;
  insert into public.group_fine_members (group_id, fine_id, user_id, bound_from)
  values (g.id, f.id, v_uid, greatest(public.groups_next_monday(v_today), f.starts_on));
end;
$$;

create function public.leave_group_fine(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  f public.group_fines;
  v_until date;
  v_row public.group_fine_members;
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  select x.* into g from public.groups x where x.id = p_group_id for update;
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  if g.archived_at is not null then
    raise exception 'group_archived';
  end if;
  select x.* into f from public.group_fines x where x.group_id = g.id and x.status = 'active' for update;
  if not found then
    raise exception 'no_active_fine';
  end if;
  select b.* into v_row from public.group_fine_members b where b.fine_id = f.id and b.user_id = v_uid and b.bound_until is null for update;
  if not found then
    raise exception 'not_bound';
  end if;
  v_until := public.groups_next_monday((pg_catalog.now() at time zone g.timezone)::date);
  if v_row.bound_from >= v_until then
    delete from public.group_fine_members b where b.fine_id = v_row.fine_id and b.user_id = v_row.user_id and b.bound_from = v_row.bound_from;
  else
    update public.group_fine_members b set bound_until = v_until
    where b.fine_id = v_row.fine_id and b.user_id = v_row.user_id and b.bound_from = v_row.bound_from;
  end if;
end;
$$;

create function public.end_group_fine(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  f public.group_fines;
  v_until date;
begin
  g := public.groups_lock_admin(v_uid, p_group_id);
  select x.* into f from public.group_fines x where x.group_id = g.id and x.status = 'active' for update;
  if not found then
    raise exception 'no_active_fine';
  end if;
  v_until := public.groups_next_monday((pg_catalog.now() at time zone g.timezone)::date);
  update public.group_fines x set status = 'ended', ends_on = greatest(v_until, f.starts_on) where x.id = f.id;
  delete from public.group_fine_members b where b.fine_id = f.id and b.bound_until is null and b.bound_from >= v_until;
  update public.group_fine_members b set bound_until = v_until where b.fine_id = f.id and b.bound_until is null;
end;
$$;

create function public.set_group_debt_paid(p_debt_id uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  v_gid uuid;
  g public.groups;
  d public.group_fund_debts;
  v_role text;
begin
  if p_paid is null then
    raise exception 'invalid_fine';
  end if;
  select x.group_id into v_gid from public.group_fund_debts x where x.id = p_debt_id;
  if not found then
    raise exception 'debt_not_found';
  end if;
  -- not groups_lock_admin: the debts of an ARCHIVED group stay markable, so only its archive check is skipped.
  -- membership first, the group row under lock, the role again under the lock
  if public.groups_member_role(v_uid, v_gid) is null then
    raise exception 'group_not_found';
  end if;
  select x.* into g from public.groups x where x.id = v_gid for update;
  v_role := public.groups_member_role(v_uid, v_gid);
  if v_role is null then
    raise exception 'group_not_found';
  end if;
  if v_role <> 'admin' then
    raise exception 'not_group_admin';
  end if;
  select x.* into d from public.group_fund_debts x where x.id = p_debt_id for update;
  -- own debt: only a sole admin may mark it, and only if the group has had no other admin since before the debt was made
  -- (demoting or removing the other admin for a moment does not open the door: admin_reduced_at records it)
  if d.debtor_id = v_uid and (
       exists (select 1 from public.group_members m where m.group_id = g.id and m.left_at is null and m.role = 'admin' and m.user_id <> v_uid)
       or (g.admin_reduced_at is not null and g.admin_reduced_at >= d.created_at)) then
    raise exception 'own_debt';
  end if;
  if p_paid then
    if d.paid_at is null then
      update public.group_fund_debts x set paid_at = pg_catalog.now(), paid_by = v_uid where x.id = d.id;
    end if;
  else
    update public.group_fund_debts x set paid_at = null, paid_by = null where x.id = d.id;
  end if;
end;
$$;

create function public.reject_group_checkin(p_group_id uuid, p_checkin_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  k public.checkins;
  v_reason text := pg_catalog.btrim(p_reason);
  v_wk date;
  v_photo boolean;
  v_role text := public.groups_member_role(v_uid, p_group_id);
begin
  -- advisory lock BEFORE the group row (the closing function takes them in the same order): a rejection and the closing of
  -- its week exclude each other. Only an admin gets to wait for it.
  if v_role is null then
    raise exception 'group_not_found';
  end if;
  if v_role <> 'admin' then
    raise exception 'not_group_admin';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group_close:' || p_group_id::text, 0));
  g := public.groups_lock_admin(v_uid, p_group_id);
  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 140 or v_reason ~ '[[:cntrl:]]' then
    raise exception 'invalid_reason';
  end if;
  if not (g.requires_photo or coalesce(g.next_requires_photo, false)) then
    raise exception 'no_photo_rule';
  end if;
  -- a photo check-in of the habit linked by an ACTIVE member of this group, dated on or after joined_on, not rejected yet
  select c.* into k
  from public.checkins c
  join public.group_members m on m.group_id = g.id and m.habit_id = c.habit_id and m.user_id = c.user_id and m.left_at is null
  where c.id = p_checkin_id and c.photo_path is not null and c.rejected_at is null and c.local_date >= m.joined_on
  for update of c;
  if not found then
    raise exception 'checkin_not_found';
  end if;
  if k.user_id = v_uid then
    raise exception 'own_checkin';
  end if;
  if k.created_at + interval '24 hours' <= pg_catalog.now() then
    raise exception 'reject_window_closed';
  end if;
  v_wk := public.groups_week_start(k.local_date);
  if exists (select 1 from public.group_weeks w where w.group_id = g.id and w.week_start = v_wk) then
    raise exception 'week_closed';
  end if;
  -- the rule of THAT week: a pending change of the commitment applies from its Monday
  v_photo := case when g.next_effective_from is not null and v_wk >= g.next_effective_from then g.next_requires_photo
                  else g.requires_photo end;
  if not v_photo then
    raise exception 'no_photo_rule';
  end if;
  update public.checkins c set rejected_at = pg_catalog.now(), rejected_by = v_uid, reject_reason = 'other' where c.id = k.id;
  insert into public.group_checkin_rejections (checkin_id, group_id, rejected_by, reason)
  values (k.id, g.id, v_uid, v_reason);
  insert into public.notifications (user_id, type, payload)
  select k.user_id, 'group_photo_rejected',
         pg_catalog.jsonb_build_object('group_id', g.id, 'group_name', g.name, 'local_date', k.local_date, 'reason', v_reason)
  where exists (select 1 from public.profiles p where p.id = k.user_id and p.deleted_at is null);
end;
$$;

-- Any admin, only for a rejection recorded by this group, never for their own photo, until that week closes.
create function public.undo_group_checkin_rejection(p_group_id uuid, p_checkin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  k public.checkins;
  v_role text := public.groups_member_role(v_uid, p_group_id);
begin
  if v_role is null then
    raise exception 'group_not_found';
  end if;
  if v_role <> 'admin' then
    raise exception 'not_group_admin';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group_close:' || p_group_id::text, 0));
  g := public.groups_lock_admin(v_uid, p_group_id);
  select c.* into k
  from public.checkins c
  join public.group_checkin_rejections r on r.checkin_id = c.id and r.group_id = g.id
  where c.id = p_checkin_id and c.rejected_at is not null
  for update of c;
  if not found then
    raise exception 'checkin_not_found';
  end if;
  -- the same predicate as the admin's right to open the photo: the owner is still an active member of this group with that
  -- habit linked
  if not exists (select 1 from public.group_members om
                 where om.group_id = g.id and om.user_id = k.user_id and om.habit_id = k.habit_id and om.left_at is null
                   and k.local_date >= om.joined_on) then
    raise exception 'checkin_not_found';
  end if;
  if k.user_id = v_uid then
    raise exception 'own_checkin';
  end if;
  if exists (select 1 from public.group_weeks w where w.group_id = g.id and w.week_start = public.groups_week_start(k.local_date)) then
    raise exception 'week_closed';
  end if;
  update public.checkins c set rejected_at = null, rejected_by = null, reject_reason = null where c.id = k.id;
  delete from public.group_checkin_rejections r where r.checkin_id = k.id;
end;
$$;

-- ================================================================== 4. read RPCs (active members only)
create function public.group_fine_state(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
  g public.groups;
  v_today date;
  f public.group_fines;
  p public.group_fines;
  v_active jsonb;
  v_proposal jsonb;
  v_from date;
  v_until date;
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  select x.* into g from public.groups x where x.id = p_group_id;
  v_today := (pg_catalog.now() at time zone g.timezone)::date;
  -- the fine in force: the active one, else one an admin ended whose last Monday has not arrived yet
  select x.* into f from public.group_fines x
  where x.group_id = g.id and (x.status = 'active' or (x.status = 'ended' and x.ends_on > v_today and x.starts_on < x.ends_on))
  order by (x.status = 'active') desc, x.starts_on desc limit 1;
  if f.id is not null then
    select b.bound_from, b.bound_until into v_from, v_until from public.group_fine_members b
    where b.fine_id = f.id and b.user_id = v_uid order by b.bound_from desc limit 1;
    v_active := pg_catalog.jsonb_build_object(
      'id', f.id, 'amount', f.amount, 'purpose', f.purpose, 'starts_on', f.starts_on, 'ends_on', f.ends_on,
      'bound_count', (select pg_catalog.count(distinct b.user_id)::int
                      from public.group_fine_members b
                      join public.group_members m on m.group_id = g.id and m.user_id = b.user_id and m.left_at is null
                      where b.fine_id = f.id and (b.bound_until is null or b.bound_until > v_today)),
      'i_am_bound', exists (select 1 from public.group_fine_members b
                            where b.fine_id = f.id and b.user_id = v_uid and (b.bound_until is null or b.bound_until > v_today)),
      'my_bound_from', v_from, 'my_bound_until', v_until);
  end if;
  select x.* into p from public.group_fines x where x.group_id = g.id and x.status = 'proposed' and x.expires_at > pg_catalog.now();
  if p.id is not null then
    v_proposal := pg_catalog.jsonb_build_object(
      'id', p.id, 'amount', p.amount, 'purpose', p.purpose,
      'proposed_by_name', (select q.display_name from public.profiles q where q.id = p.proposed_by),
      'expires_at', p.expires_at, 'accepted_count', public.groups_fine_accepted(p.id),
      'needed_count', (p.eligible_count + 1) / 2,
      -- a vote shows only while it counts (cast during the current membership), like groups_fine_accepted
      'my_vote', (select v.accepted from public.group_fine_votes v
                  join public.group_members m on m.group_id = g.id and m.user_id = v.user_id and m.left_at is null
                  where v.fine_id = p.id and v.user_id = v_uid and v.voted_at >= m.joined_at));
  end if;
  return pg_catalog.jsonb_build_object(
    'active', v_active, 'proposal', v_proposal,
    'single_admin', (select pg_catalog.count(*) from public.group_members m
                     where m.group_id = g.id and m.left_at is null and m.role = 'admin') = 1);
end;
$$;

create function public.group_fund(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
begin
  if public.groups_member_role(v_uid, p_group_id) is null then
    raise exception 'group_not_found';
  end if;
  return pg_catalog.jsonb_build_object(
    'totals', (select pg_catalog.jsonb_build_object(
                 'registered', coalesce(pg_catalog.sum(d.amount), 0),
                 'paid', coalesce(pg_catalog.sum(d.amount) filter (where d.paid_at is not null), 0),
                 'pending', coalesce(pg_catalog.sum(d.amount) filter (where d.paid_at is null), 0))
               from public.group_fund_debts d where d.group_id = p_group_id),
    'people', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'user_id', s.user_id, 'username', s.username, 'display_name', s.display_name,
               'avatar_path', s.avatar_path, 'avatar_preset', s.avatar_preset, 'pending', s.pending)
             order by s.pending desc, s.username, s.user_id)
      from (select d.debtor_id as user_id, p.username::text as username, p.display_name, p.avatar_path, p.avatar_preset,
                   pg_catalog.sum(d.amount)::int as pending
            from public.group_fund_debts d
            join public.group_members m on m.group_id = d.group_id and m.user_id = d.debtor_id and m.left_at is null
            join public.profiles p on p.id = d.debtor_id
            where d.group_id = p_group_id and d.paid_at is null
            group by d.debtor_id, p.username, p.display_name, p.avatar_path, p.avatar_preset) s), '[]'::jsonb),
    'debts', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'debt_id', s.id, 'week_start', s.week_start, 'amount', s.amount, 'paid_at', s.paid_at,
               'paid_by_name', s.paid_by_name, 'user_id', s.debtor_id, 'username', s.username,
               'display_name', s.display_name, 'avatar_path', s.avatar_path, 'avatar_preset', s.avatar_preset,
               'mine', s.debtor_id = v_uid)
             order by s.week_start desc, s.created_at desc, s.id)
      from (select d.id, d.week_start, d.amount, d.paid_at, d.created_at, d.debtor_id,
                   (select q.display_name from public.profiles q where q.id = d.paid_by) as paid_by_name,
                   p.username::text as username, p.display_name, p.avatar_path, p.avatar_preset
            from public.group_fund_debts d
            join public.profiles p on p.id = d.debtor_id
            where d.group_id = p_group_id
            order by d.week_start desc, d.created_at desc, d.id
            limit 100) s), '[]'::jsonb));
end;
$$;

-- What the caller owes (per group, even groups they left) and the pending total of the groups they administer.
create function public.my_fund_debts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.groups_actor();
begin
  return pg_catalog.jsonb_build_object(
    'owed', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('group_id', s.id, 'group_name', s.name, 'pending', s.pending)
             order by s.name, s.id)
      from (select g.id, g.name, pg_catalog.sum(d.amount)::int as pending
            from public.group_fund_debts d join public.groups g on g.id = d.group_id
            where d.debtor_id = v_uid and d.paid_at is null
            group by g.id, g.name) s), '[]'::jsonb),
    'administered', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('group_id', s.id, 'group_name', s.name, 'pending', s.pending)
             order by s.name, s.id)
      from (select g.id, g.name, pg_catalog.sum(d.amount)::int as pending
            from public.group_members m
            join public.groups g on g.id = m.group_id
            join public.group_fund_debts d on d.group_id = g.id and d.paid_at is null
            where m.user_id = v_uid and m.left_at is null and m.role = 'admin'
            group by g.id, g.name) s), '[]'::jsonb));
end;
$$;

-- Rejected photos of weeks not yet closed: every one for an admin, only the caller's own for a plain member. The only place
-- where a reason is read.
create function public.group_rejected_checkins(p_group_id uuid)
returns table (
  checkin_id uuid, user_id uuid, username text, display_name text, avatar_path text, avatar_preset smallint,
  local_date date, photo_path text, reason text, rejected_by_name text, rejected_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.groups_actor();
  v_role text := public.groups_member_role(v_uid, p_group_id);
begin
  if v_role is null then
    raise exception 'group_not_found';
  end if;
  return query
  select c.id, c.user_id, p.username::text, p.display_name, p.avatar_path, p.avatar_preset,
         c.local_date, c.photo_path, r.reason, pb.display_name, r.rejected_at
  from public.group_checkin_rejections r
  join public.checkins c on c.id = r.checkin_id and c.rejected_at is not null
  join public.group_members m on m.group_id = r.group_id and m.habit_id = c.habit_id and m.user_id = c.user_id and m.left_at is null
  join public.profiles p on p.id = c.user_id
  join public.profiles pb on pb.id = r.rejected_by
  where r.group_id = p_group_id and (v_role = 'admin' or c.user_id = v_uid)
    and not exists (select 1 from public.group_weeks w
                    where w.group_id = r.group_id and w.week_start = public.groups_week_start(c.local_date))
  order by r.rejected_at desc, c.id;
end;
$$;

-- ================================================================== 5. closing weeks (replaces the 0023 functions)
-- 0023's body, plus: the week snapshots the fine in force, and every member with a result row who did not comply and was
-- bound for the whole week gets one debt (idempotent), told once.
create or replace function public.groups_close_week(p_group_id uuid, p_week date, p_now timestamptz)
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
  v_fine uuid;
  v_fine_amount int;
begin
  select x.* into g from public.groups x where x.id = p_group_id;
  v_from := p_week::timestamp at time zone g.timezone;
  v_to := (p_week + 7)::timestamp at time zone g.timezone;
  v_fine := public.groups_fine_for_week(g.id, p_week);

  with mm as (
    -- every membership of the group that touches the week (a person can have several: leaving and coming back)
    select m.user_id, m.habit_id, m.joined_on, m.joined_at, m.left_at, m.left_reason, m.counts_from,
           case when m.left_at is not null and m.left_at < v_to then (m.left_at at time zone g.timezone)::date end as left_on
    from public.group_members m
    where m.group_id = g.id and m.joined_at < v_to and (m.left_at is null or m.left_at > v_from)
  ),
  cand as (
    -- members that get a result row: counted from that Monday on, active at some moment of the week. One who left DURING
    -- the week keeps a row with counted = false (the fine needs it); it does not enter the counts or the streak. `counted`
    -- is read from the membership that counts from that Monday (the latest such one), as in 0023.
    select distinct on (mm.user_id) mm.user_id, (mm.left_at is null or mm.left_at >= v_to) as counted
    from mm
    where mm.counts_from <= p_week
      -- anyone with a membership that ended as removed by an admin or by account deletion touching the week gets no row,
      -- even if they were invited again later that week
      and not exists (select 1 from mm x where x.user_id = mm.user_id and x.left_reason in ('removed', 'account_deleted'))
    order by mm.user_id, mm.joined_at desc
  ),
  res as (
    -- done: the valid check-ins of the habit of EVERY membership of the person that touches the week, each from its joined_on
    -- up to the day that membership ended. DAYS are counted, not check-ins: two habits on one day are one day, exactly as
    -- before (one habit has at most one check-in per day)
    select cand.user_id, cand.counted, pg_catalog.count(distinct c.local_date)::int as done
    from cand
    join mm on mm.user_id = cand.user_id
    left join public.checkins c
      on c.habit_id = mm.habit_id and c.local_date between p_week and p_week + 6 and c.local_date >= mm.joined_on
     and (mm.left_on is null or c.local_date <= mm.left_on)
     and c.rejected_at is null and (not g.requires_photo or c.photo_path is not null)
    group by cand.user_id, cand.counted
  ),
  ins as (
    insert into public.group_week_results (group_id, week_start, user_id, done, target, complied, counted, bound)
    select g.id, p_week, res.user_id, res.done, g.target_per_week, res.done >= g.target_per_week, res.counted,
           v_fine is not null and exists (select 1 from public.group_fine_members b
                                          where b.fine_id = v_fine and b.user_id = res.user_id and b.bound_from <= p_week
                                            and (b.bound_until is null or b.bound_until > p_week))
    from res
    on conflict do nothing
    returning counted, complied
  )
  select (pg_catalog.count(*) filter (where ins.counted))::int,
         (pg_catalog.count(*) filter (where ins.counted and ins.complied))::int
    into v_counted, v_complied from ins;

  v_fine_amount := (select f.amount from public.group_fines f where f.id = v_fine);
  insert into public.group_weeks (group_id, week_start, closed_at, commitment_name, target_per_week, requires_photo,
                                  members_counted, members_complied, fine_id, fine_amount)
  values (g.id, p_week, p_now, g.commitment_name, g.target_per_week, g.requires_photo, v_counted, v_complied, v_fine, v_fine_amount)
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
    where r.group_id = g.id and r.week_start = p_week and r.counted;
  end if;

  -- debts, from the week's own snapshot (fine) and the rows' own `bound` (so a second call, or a run that lost the race, finds
  -- the same fine and the same people and inserts nothing)
  select w.fine_id, w.fine_amount into v_fine, v_fine_amount
  from public.group_weeks w where w.group_id = g.id and w.week_start = p_week;
  if v_fine is not null then
    with d as (
      insert into public.group_fund_debts (group_id, fine_id, week_start, debtor_id, amount)
      select g.id, v_fine, p_week, r.user_id, v_fine_amount
      from public.group_week_results r
      join public.profiles p on p.id = r.user_id and p.deleted_at is null
      where r.group_id = g.id and r.week_start = p_week and not r.complied and r.bound
      on conflict (group_id, week_start, debtor_id) do nothing
      returning debtor_id, amount
    )
    insert into public.notifications (user_id, type, payload)
    select d.debtor_id, 'group_fund_debt',
           pg_catalog.jsonb_build_object('group_id', g.id, 'group_name', g.name, 'week_start', p_week, 'amount', d.amount)
    from d;
  end if;
end;
$$;

-- 0023's function, plus: stale proposals of THIS group expire first (group row locked before the fine rows; the caller already
-- holds the per-group advisory lock). A failure there skips the group for this run, like a failed week.
create or replace function public.groups_close_group(p_group_id uuid, p_now timestamptz)
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
  if exists (select 1 from public.group_fines f where f.group_id = p_group_id and f.status = 'proposed' and f.expires_at <= p_now) then
    begin
      perform 1 from public.groups x where x.id = p_group_id for update;
      perform public.groups_expire_fines(p_group_id, p_now);
    exception when others then
      raise warning 'groups_close_group % expiry: %', p_group_id, sqlerrm;
      return -1;
    end;
  end if;
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
      return -(v_n + 1);
    end;
  end loop;
  return v_n;
end;
$$;

-- 0023's function, except that the groups it visits also include those that only have a stale proposal (expired inside
-- groups_close_group, per group, never in a global sweep).
create or replace function public.close_due_group_weeks(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_total int := 0;
  v_n int;
  v_failed int := 0;
begin
  for r in
    select d.id
    from (
      select x.id, x.timezone,
             coalesce((select pg_catalog.max(w.week_start) + 7 from public.group_weeks w where w.group_id = x.id),
                      public.groups_week_start((x.created_at at time zone x.timezone)::date)) as nxt,
             exists (select 1 from public.group_fines f where f.group_id = x.id and f.status = 'proposed' and f.expires_at <= p_now) as stale
      from public.groups x
      where x.archived_at is null
    ) d
    where (p_now at time zone d.timezone)::date >= d.nxt + 7 or d.stale
    order by d.nxt, d.id
    limit 500
  loop
    if pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('group_close:' || r.id::text, 0)) then
      v_n := public.groups_close_group(r.id, p_now);
      if v_n < 0 then
        v_failed := v_failed + 1;
        v_n := -v_n - 1;
      end if;
      v_total := v_total + v_n;
    end if;
  end loop;
  if v_failed > 0 then
    raise warning 'close_due_group_weeks: % group(s) had a week that failed and were skipped for this run', v_failed;
  end if;
  return v_total;
end;
$$;

-- ================================================================== 5b. photos: the admin's narrow branch
-- 0023's helper with a second branch. The first branch is kept exactly. The second lets an ACTIVE admin open the photo of a
-- check-in rejected THROUGH THE GROUP (a row in group_checkin_rejections of that very group) while the rejection can still be
-- undone: group not archived, the owner still an active member of that group with that habit linked and the check-in dated
-- on or after their joined_on, the check-in's week not closed. undo_group_checkin_rejection enforces the same predicate. A
-- photo rejected by a challenge rival has no such row, so it never becomes readable through it. Every lookup is a primary
-- key lookup (the check-in id comes from the object name, group_checkin_rejections is keyed by the check-in id).
create or replace function public.group_proof_readable(p_name text)
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
    join public.habits hb on hb.id = c.habit_id and hb.visibility <> 'private'
    join public.group_members me on me.group_id = om.group_id and me.user_id = v_uid and me.is_live
    where c.id = v_id and c.photo_path = p_name and c.rejected_at is null and c.local_date >= om.joined_on
  ) or exists (
    select 1
    from public.group_checkin_rejections r
    join public.checkins c on c.id = r.checkin_id
    join public.groups g on g.id = r.group_id and g.archived_at is null
    join public.habits hb on hb.id = c.habit_id and hb.visibility <> 'private'
    join public.group_members me on me.group_id = r.group_id and me.user_id = v_uid and me.role = 'admin' and me.left_at is null and me.is_live
    join public.group_members om on om.group_id = r.group_id and om.user_id = c.user_id and om.habit_id = c.habit_id and om.left_at is null
    where r.checkin_id = v_id and c.photo_path = p_name and c.rejected_at is not null and c.local_date >= om.joined_on
      and not exists (select 1 from public.group_weeks w
                      where w.group_id = r.group_id and w.week_start = public.groups_week_start(c.local_date))
  );
end;
$$;

-- ================================================================== 5c. the public invitation page (service role only)
-- The fine to show on an invitation: null unless the code is a valid invitation (same rule as the preview) of a group with a fine
-- in force or approved to start next Monday (the active fine, else one an admin ended whose last Monday has not arrived).
-- Never raises for a bad code, never counts attempts.
create function public.group_invite_fine_for(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := public.groups_normalize_code(p_code);
  v_result jsonb;
begin
  if v_code is null then
    return null;
  end if;
  select pg_catalog.jsonb_build_object('amount', f.amount, 'purpose', f.purpose)
  into v_result
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  join public.group_fines f on f.group_id = g.id
  where i.code = v_code and i.expires_at > pg_catalog.now() and i.uses < i.max_uses and g.archived_at is null
    and (f.status = 'active'
         or (f.status = 'ended' and f.ends_on > (pg_catalog.now() at time zone g.timezone)::date and f.starts_on < f.ends_on))
  order by (f.status = 'active') desc, f.starts_on desc
  limit 1;
  return v_result;
end;
$$;

-- One atomic "look up and count failures" call for the public invitation page. Calls with the same key are serialised by the
-- same transaction-level advisory lock on the same SHA-256 digest that rate_limit uses, and failures are stored in the same
-- table, so the two agree. rate_limit, group_invite_preview_for and join_group are not modified. A key already at p_limit
-- failures inside the window is answered "limited" and nothing is looked up; a lookup that finds nothing records ONE failure; a
-- lookup that finds the invitation records nothing.
create function public.group_invite_lookup(
  p_code text, p_viewer uuid, p_key text, p_limit integer default 20, p_window_seconds integer default 900
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_limit int := greatest(1, least(1000, coalesce(p_limit, 20)));
  v_window int := greatest(1, least(86400, coalesce(p_window_seconds, 900)));
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_n int;
  v_preview jsonb;
begin
  if p_key is null or p_key = '' or pg_catalog.char_length(p_key) > 200 then
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
    return pg_catalog.jsonb_build_object('limited', true, 'preview', null);
  end if;
  v_preview := public.group_invite_preview_for(p_code, p_viewer);
  if v_preview is null then
    insert into public.rate_limit_events (key_hash, at) values (v_hash, v_now);
  end if;
  return pg_catalog.jsonb_build_object('limited', false, 'preview', v_preview);
end;
$$;

-- ================================================================== 6. grants
revoke execute on function
  public.groups_fine_accepted(uuid), public.groups_fine_for_week(uuid, date), public.groups_expire_fines(uuid, timestamptz),
  public.groups_fine_activate(uuid, timestamptz), public.groups_end_fine_binding(), public.groups_note_admin_reduced(),
  public.groups_close_week(uuid, date, timestamptz), public.groups_close_group(uuid, timestamptz),
  public.close_due_group_weeks(timestamptz), public.group_proof_readable(text),
  public.group_invite_fine_for(text), public.group_invite_lookup(text, uuid, text, integer, integer)
  from public, anon, authenticated;

revoke execute on function
  public.propose_group_fine(uuid, integer, text), public.vote_group_fine(uuid, boolean), public.accept_group_fine(uuid),
  public.leave_group_fine(uuid), public.end_group_fine(uuid), public.set_group_debt_paid(uuid, boolean),
  public.reject_group_checkin(uuid, uuid, text), public.undo_group_checkin_rejection(uuid, uuid),
  public.group_fine_state(uuid), public.group_fund(uuid), public.my_fund_debts(), public.group_rejected_checkins(uuid)
  from public, anon, authenticated;

grant execute on function
  public.propose_group_fine(uuid, integer, text), public.vote_group_fine(uuid, boolean), public.accept_group_fine(uuid),
  public.leave_group_fine(uuid), public.end_group_fine(uuid), public.set_group_debt_paid(uuid, boolean),
  public.reject_group_checkin(uuid, uuid, text), public.undo_group_checkin_rejection(uuid, uuid),
  public.group_fine_state(uuid), public.group_fund(uuid), public.my_fund_debts(), public.group_rejected_checkins(uuid)
  to authenticated;
grant execute on function public.close_due_group_weeks(timestamptz) to service_role;
-- the replaced proofs helper is called by the storage policy as the client
grant execute on function public.group_proof_readable(text) to authenticated;
grant execute on function public.group_invite_fine_for(text), public.group_invite_lookup(text, uuid, text, integer, integer) to service_role;
