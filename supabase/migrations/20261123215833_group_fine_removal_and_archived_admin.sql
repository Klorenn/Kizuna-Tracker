-- Prevent removal and reinvitation from erasing a bound member's weekly fine evaluation.
-- Removed memberships stay outside public counts, but the fine uses their result row.

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
    -- members that get a result row: counted from that Monday on, active at some moment of the week. A removal or
    -- account deletion keeps a false-counted row for fine evaluation, even if the person is invited back that week.
    select distinct on (mm.user_id) mm.user_id,
           (mm.left_at is null or mm.left_at >= v_to)
             and not exists (select 1 from mm x where x.user_id = mm.user_id and x.left_reason in ('removed', 'account_deleted')) as counted
    from mm
    where mm.counts_from <= p_week
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


-- If an archived group has no alternate administrator, its surviving administrator can settle every debt.
create or replace function public.set_group_debt_paid(p_debt_id uuid, p_paid boolean)
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
       or (g.archived_at is null and g.admin_reduced_at is not null and g.admin_reduced_at >= d.created_at)) then
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



-- An archived group still needs an admin to settle its existing debt ledger. If its last active admin
-- leaves, promote the longest-standing active member. The leaving RPC and account-deletion path lock
-- the group row before changing membership, serializing this trigger with other role changes.
create function public.groups_promote_archived_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived boolean;
  v_has_admin boolean;
  v_next_user uuid;
begin
  if old.role <> 'admin' or old.left_at is not null or new.left_at is null then
    return new;
  end if;

  select g.archived_at is not null into v_archived
  from public.groups g where g.id = new.group_id;
  if not coalesce(v_archived, false) then
    return new;
  end if;

  select exists (select 1 from public.group_members m
                 where m.group_id = new.group_id and m.left_at is null and m.role = 'admin')
    into v_has_admin;
  if v_has_admin then
    return new;
  end if;

  select m.user_id into v_next_user
  from public.group_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  where m.group_id = new.group_id and m.left_at is null
  order by m.joined_at, m.user_id
  limit 1;

  if v_next_user is not null then
    update public.group_members m set role = 'admin'
    where m.group_id = new.group_id and m.user_id = v_next_user and m.left_at is null;
  end if;
  return new;
end;
$$;

create trigger group_members_promote_archived_admin
  after update of left_at on public.group_members
  for each row when (old.role = 'admin' and old.left_at is null and new.left_at is not null)
  execute function public.groups_promote_archived_admin();

-- Repair archived groups already left without an active admin.
with candidates as (
  select distinct on (m.group_id) m.group_id, m.user_id
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.left_at is null
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  where g.archived_at is not null
    and not exists (select 1 from public.group_members a where a.group_id = g.id and a.left_at is null and a.role = 'admin')
  order by m.group_id, m.joined_at, m.user_id
)
update public.group_members m set role = 'admin'
from candidates c
where m.group_id = c.group_id and m.user_id = c.user_id and m.left_at is null;

revoke execute on function public.groups_promote_archived_admin() from public, anon, authenticated;
