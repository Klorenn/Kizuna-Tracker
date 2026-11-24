begin;
-- Group fines (0025): proposal and vote, who is bound, fund debts, paid marks, photo rejection by admins, the closing of
-- weeks with fines, the reads and the notifications. Own fixtures. Everything is rolled back.
create extension if not exists pgtap with schema extensions;
select plan(382);

create schema tests;
-- ids: users e3900000-...-0000000000NN, habits b3900000-...-<user>-<k>, check-ins c3900000-..., groups d3900000-...
create function tests.u(n int) returns uuid language sql immutable as $f$
  select ('e3900000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $f$;
create function tests.h(u int, k int) returns uuid language sql immutable as $f$
  select ('b3900000-0000-0000-' || lpad(u::text, 4, '0') || '-' || lpad(k::text, 12, '0'))::uuid $f$;
create function tests.c(u int, k int) returns uuid language sql immutable as $f$
  select ('c3900000-0000-0000-' || lpad(u::text, 4, '0') || '-' || lpad(k::text, 12, '0'))::uuid $f$;
create function tests.gid(n int) returns uuid language sql immutable as $f$
  select ('d3900000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $f$;
create function tests.today() returns date language sql stable as $f$
  select (now() at time zone 'America/Santiago')::date $f$;
create function tests.nm() returns date language sql stable as $f$
  select tests.today() + (8 - extract(isodow from tests.today())::int) $f$;
create function tests.wk() returns date language sql stable as $f$
  select date_trunc('week', now() at time zone 'America/Santiago')::date $f$;
create function tests.as(n int) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', tests.u(n), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create function tests.nosession() returns void language sql as $f$
  select set_config('request.jwt.claims', '{"role":"authenticated"}', true) $f$;
create table tests.ctx (k text primary key, v uuid);
create function tests.save(key text, val uuid) returns uuid language plpgsql security definer as $f$
begin insert into tests.ctx (k, v) values (key, val) on conflict (k) do update set v = excluded.v; return val; end $f$;
create function tests.g(k text) returns uuid language sql stable security definer as $f$
  select v from tests.ctx where ctx.k = $1 $f$;
-- first column of the first row of any statement, read with the owner's rights
create function tests.val(q text) returns text language plpgsql security definer as $f$
declare r text;
begin execute q into r; return r; end $f$;
create function tests.denied(r text, stmt text) returns boolean language plpgsql as $f$
begin
  execute format('set local role %I', r);
  begin
    execute stmt;
  exception when insufficient_privilege then
    reset role; return true;
  when others then
    reset role; return false;
  end;
  reset role;
  return false;
end $f$;
-- moves every fine event of a group d days into the past (a Monday-preserving time machine for d = 7k)
create function tests.age(p_group uuid, d int, p_only uuid default null) returns void language plpgsql security definer as $f$
begin
  update public.group_fine_votes v set voted_at = v.voted_at - d * interval '1 day'
  where v.fine_id in (select f.id from public.group_fines f where f.group_id = p_group and (p_only is null or f.id = p_only));
  update public.group_fine_members m set bound_from = m.bound_from - d, bound_until = m.bound_until - d
  where m.group_id = p_group and (p_only is null or m.fine_id = p_only);
  update public.group_fines f set proposed_at = f.proposed_at - d * interval '1 day', expires_at = f.expires_at - d * interval '1 day',
    starts_on = f.starts_on - d, ends_on = f.ends_on - d, decided_at = f.decided_at - d * interval '1 day'
  where f.group_id = p_group and (p_only is null or f.id = p_only);
end $f$;
-- fixtures only
create function tests.grp(p_id uuid, p_name text, p_creator int, p_photo boolean default false,
                          p_created timestamptz default now() - interval '30 days', p_archived boolean default false)
returns void language sql as $f$
  insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at, archived_at)
  values (p_id, p_name, 'barbell', 'salvia', 'Gym', 'barbell', 2, p_photo, 'America/Santiago', tests.u(p_creator), p_created,
          case when p_archived then now() end) $f$;
create function tests.mem(p_group uuid, p_user int, p_role text default 'member', p_photo boolean default false, p_left text default null)
returns void language sql as $f$
  insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from, left_at, left_reason, is_live)
  values (p_group, tests.u(p_user), p_role, tests.h(p_user, case when p_photo then 6 else 1 end), now() - interval '20 days',
          tests.today() - 20, tests.wk() - 14, case when p_left is not null then now() - interval '1 day' end, p_left, p_left is null) $f$;
create temp table t_snap (k text primary key, v text);
create temp table t_n (k text primary key, n int);
grant all on t_snap, t_n to authenticated, anon, service_role;
grant usage on schema tests to authenticated, anon, service_role;
grant execute on function tests.u(int), tests.h(int, int), tests.c(int, int), tests.gid(int), tests.today(), tests.nm(), tests.wk(),
  tests.as(int), tests.nosession(), tests.save(text, uuid), tests.g(text), tests.val(text), tests.denied(text, text) to authenticated, anon, service_role;
grant select on tests.ctx to authenticated, anon;

-- ===================================================== fixtures (as postgres)
-- users 1..200. GM = gid 1: 01 ana admin, 02 bruno admin, 03..06 members, 07 left, 08 removed. GX = gid 2: 10 admin, 11 member. 12 in no group.
insert into auth.users (id) select tests.u(g) from generate_series(1, 200) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
select tests.u(g), 'g39_' || lpad(g::text, 3, '0'), 'U' || g, 'Test', '1990-01-01', now(), 'America/Santiago' from generate_series(1, 200) g;
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility)
select tests.h(u, k), tests.u(u), 'H' || u || '-' || k, 'barbell', 'daily', k = 6, 'friends'
from generate_series(1, 200) u, generate_series(1, 6) k;

select tests.grp(tests.gid(1), 'Fondo', 1);
select tests.mem(tests.gid(1), 1, 'admin'), tests.mem(tests.gid(1), 2, 'admin'), tests.mem(tests.gid(1), 3), tests.mem(tests.gid(1), 4),
       tests.mem(tests.gid(1), 5), tests.mem(tests.gid(1), 6), tests.mem(tests.gid(1), 7, 'member', false, 'left'),
       tests.mem(tests.gid(1), 8, 'member', false, 'removed');
select tests.grp(tests.gid(2), 'Otro grupo', 10);
select tests.mem(tests.gid(2), 10, 'admin'), tests.mem(tests.gid(2), 11);
-- groups of one, two, five and six members for the threshold
select tests.grp(tests.gid(11), 'Uno', 21), tests.mem(tests.gid(11), 21, 'admin');
select tests.grp(tests.gid(12), 'Dos', 31), tests.mem(tests.gid(12), 31, 'admin'), tests.mem(tests.gid(12), 32);
select tests.grp(tests.gid(15), 'Cinco', 41), tests.mem(tests.gid(15), 41, 'admin'), tests.mem(tests.gid(15), 42), tests.mem(tests.gid(15), 43),
       tests.mem(tests.gid(15), 44), tests.mem(tests.gid(15), 45);
select tests.grp(tests.gid(16), 'Seis', 51), tests.mem(tests.gid(16), 51, 'admin'), tests.mem(tests.gid(16), 52), tests.mem(tests.gid(16), 53),
       tests.mem(tests.gid(16), 54), tests.mem(tests.gid(16), 55), tests.mem(tests.gid(16), 56);
-- fund groups: GD one admin (61) + 62, 63; GD2 two admins (71, 72) + 73; GD3 archived (64 admin)
select tests.grp(tests.gid(21), 'Fondo uno', 61), tests.mem(tests.gid(21), 61, 'admin'), tests.mem(tests.gid(21), 62), tests.mem(tests.gid(21), 63);
select tests.grp(tests.gid(22), 'Fondo dos', 71), tests.mem(tests.gid(22), 71, 'admin'), tests.mem(tests.gid(22), 72, 'admin'), tests.mem(tests.gid(22), 73);
select tests.grp(tests.gid(23), 'Fondo archivado', 64, false, now() - interval '30 days', true), tests.mem(tests.gid(23), 64, 'admin');
insert into public.group_fines (id, group_id, amount, purpose, proposed_by, proposed_at, expires_at, eligible_count, status, starts_on, decided_at) values
  (tests.gid(121), tests.gid(21), 1000, 'Asado', tests.u(61), now() - interval '20 days', now() - interval '13 days', 3, 'active', tests.wk() - 14, now() - interval '19 days'),
  (tests.gid(122), tests.gid(22), 2000, 'Viaje', tests.u(71), now() - interval '20 days', now() - interval '13 days', 3, 'active', tests.wk() - 14, now() - interval '19 days'),
  (tests.gid(123), tests.gid(23), 500, 'Viejo', tests.u(64), now() - interval '20 days', now() - interval '13 days', 1, 'active', tests.wk() - 14, now() - interval '19 days');
insert into public.group_fund_debts (id, group_id, fine_id, week_start, debtor_id, amount) values
  (tests.gid(201), tests.gid(21), tests.gid(121), tests.wk() - 14, tests.u(62), 1000),
  (tests.gid(202), tests.gid(21), tests.gid(121), tests.wk() - 14, tests.u(61), 1000),
  (tests.gid(203), tests.gid(21), tests.gid(121), tests.wk() - 7, tests.u(62), 1000),
  (tests.gid(204), tests.gid(22), tests.gid(122), tests.wk() - 14, tests.u(73), 2000),
  (tests.gid(205), tests.gid(22), tests.gid(122), tests.wk() - 14, tests.u(71), 2000),
  (tests.gid(206), tests.gid(22), tests.gid(122), tests.wk() - 14, tests.u(72), 2000),
  (tests.gid(207), tests.gid(23), tests.gid(123), tests.wk() - 14, tests.u(64), 500);
-- a person who left GD but still owes
select tests.mem(tests.gid(21), 65, 'member', false, 'left');
insert into public.group_fund_debts (id, group_id, fine_id, week_start, debtor_id, amount, paid_at, paid_by) values
  (tests.gid(208), tests.gid(21), tests.gid(121), tests.wk() - 14, tests.u(65), 1000, now(), tests.u(61));
-- photo rejection groups. GP: 81 and 82 admins, 83, 84, 85, 86, 87 members. GN: no photo rule (95 admin, 96). GQ: another photo group (97 admin, 98)
select tests.grp(tests.gid(31), 'Fotos', 81, true), tests.mem(tests.gid(31), 81, 'admin', true), tests.mem(tests.gid(31), 82, 'admin', true),
       tests.mem(tests.gid(31), 83, 'member', true), tests.mem(tests.gid(31), 84, 'member', true), tests.mem(tests.gid(31), 85, 'member', true),
       tests.mem(tests.gid(31), 86, 'member', true), tests.mem(tests.gid(31), 87, 'member', true);
select tests.grp(tests.gid(32), 'Sin fotos', 95), tests.mem(tests.gid(32), 95, 'admin'), tests.mem(tests.gid(32), 96);
select tests.grp(tests.gid(33), 'Otras fotos', 97, true), tests.mem(tests.gid(33), 97, 'admin', true), tests.mem(tests.gid(33), 98, 'member', true);
-- a check-in is (user, k) on habit k=6 (photo habit); `ago` is its age; `d` its local date
create function tests.shot(p_u int, p_k int, p_ago interval, p_d date, p_habit int default 6) returns void language sql as $f$
  insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at)
  values (tests.c(p_u, p_k), tests.h(p_u, p_habit), tests.u(p_u), p_d, tests.u(p_u)::text || '/' || tests.c(p_u, p_k)::text || '.jpg', now() - p_ago) $f$;
select tests.shot(83, 1, interval '1 hour', tests.today());      -- fresh, rejectable
select tests.shot(85, 1, interval '25 hours', tests.today());    -- window closed
select tests.shot(81, 1, interval '1 hour', tests.today());      -- an admin's own
select tests.shot(84, 1, interval '1 hour', tests.today());      -- fresh, for the undo
select tests.shot(86, 1, interval '1 hour', tests.today());      -- fresh, second admin
select tests.shot(87, 1, interval '1 hour', tests.today());      -- fresh, rejected by a challenge rival
select tests.shot(96, 1, interval '1 hour', tests.today());      -- in a group without a photo rule
select tests.shot(98, 1, interval '1 hour', tests.today());      -- in another photo group
-- not linked habit of 83 (k=7 is a second photo habit), a check-in without a photo, one dated before joining
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility) values (tests.h(83, 7), tests.u(83), 'Otro', 'barbell', 'daily', true, 'friends');
select tests.shot(83, 2, interval '1 hour', tests.today(), 7);
insert into public.checkins (id, habit_id, user_id, local_date) values (tests.c(83, 3), tests.h(83, 6), tests.u(83), tests.today() - 1);
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at)
values (tests.c(84, 2), tests.h(84, 6), tests.u(84), tests.today() - 30, tests.u(84)::text || '/' || tests.c(84, 2)::text || '.jpg', now() - interval '1 hour');
-- a check-in in a closed group week (created recently, dated in the closed week)
insert into public.group_weeks (group_id, week_start, closed_at, commitment_name, target_per_week, requires_photo, members_counted, members_complied)
values (tests.gid(31), tests.wk() - 14, now(), 'Gym', 2, true, 0, 0);
select tests.shot(84, 3, interval '2 hours', tests.wk() - 12);
-- a rejection made by a group admin inside that closed week (for the undo refusal)
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at, rejected_at, rejected_by, reject_reason)
values (tests.c(86, 3), tests.h(86, 6), tests.u(86), tests.wk() - 13, tests.u(86)::text || '/' || tests.c(86, 3)::text || '.jpg', now() - interval '2 hours', now(), tests.u(81), 'other');
-- an active photo challenge: 87 against 94, the rival rejects 87's photo
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility) values (tests.h(94, 6), tests.u(94), 'Reto', 'barbell', 'daily', true, 'friends')
on conflict do nothing;
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone, status, starts_on)
values (tests.gid(900), tests.u(87), tests.u(94), tests.h(87, 6), tests.h(94, 6), 'daily', null, true, 4, 1000, 'America/Santiago', 'active', tests.today() - 1);


-- round 1 fixtures. GD2 gets one more debt of admin 71; GD5 (74, 75 admins) and GD4 (66 admin, 67) hold own debts; GA (68 admin,
-- 69 member) is an ARCHIVED photo group with an active fine, an open proposal, two debts and two photos (one already rejected).
insert into public.group_fund_debts (id, group_id, fine_id, week_start, debtor_id, amount) values
  (tests.gid(209), tests.gid(22), tests.gid(122), tests.wk() - 21, tests.u(71), 2000);
select tests.grp(tests.gid(26), 'Fondo cinco', 74), tests.mem(tests.gid(26), 74, 'admin'), tests.mem(tests.gid(26), 75, 'admin');
select tests.grp(tests.gid(25), 'Fondo cuatro', 66), tests.mem(tests.gid(25), 66, 'admin'), tests.mem(tests.gid(25), 67);
select tests.grp(tests.gid(24), 'Fondo archivado dos', 68, true, now() - interval '30 days', true),
       tests.mem(tests.gid(24), 68, 'admin', true), tests.mem(tests.gid(24), 69, 'member', true);
insert into public.group_fines (id, group_id, amount, purpose, proposed_by, proposed_at, expires_at, eligible_count, status, starts_on, decided_at) values
  (tests.gid(124), tests.gid(24), 300, 'Archivado', tests.u(68), now() - interval '20 days', now() - interval '13 days', 2, 'active', tests.wk() - 14, now() - interval '19 days'),
  (tests.gid(125), tests.gid(25), 300, 'Cuatro', tests.u(66), now() - interval '20 days', now() - interval '13 days', 2, 'active', tests.wk() - 14, now() - interval '19 days'),
  (tests.gid(126), tests.gid(26), 300, 'Cinco', tests.u(74), now() - interval '20 days', now() - interval '13 days', 2, 'active', tests.wk() - 14, now() - interval '19 days');
insert into public.group_fines (id, group_id, amount, purpose, proposed_by, eligible_count, status) values
  (tests.gid(127), tests.gid(24), 400, 'Nueva', tests.u(68), 2, 'proposed');
insert into public.group_fund_debts (id, group_id, fine_id, week_start, debtor_id, amount) values
  (tests.gid(210), tests.gid(26), tests.gid(126), tests.wk() - 14, tests.u(74), 300),
  (tests.gid(211), tests.gid(25), tests.gid(125), tests.wk() - 14, tests.u(66), 300),
  (tests.gid(212), tests.gid(24), tests.gid(124), tests.wk() - 14, tests.u(69), 300),
  (tests.gid(213), tests.gid(24), tests.gid(124), tests.wk() - 14, tests.u(68), 300);
-- the other admin of GD4 stopped being one two days ago, before the debt was made
update public.groups set admin_reduced_at = now() - interval '2 days' where id = tests.gid(25);
select tests.shot(69, 1, interval '1 hour', tests.today());
select tests.shot(69, 2, interval '1 hour', tests.today() - 1);
update public.checkins set rejected_at = now(), rejected_by = tests.u(68), reject_reason = 'other' where id = tests.c(69, 2);
insert into public.group_checkin_rejections (checkin_id, group_id, rejected_by, reason) values (tests.c(69, 2), tests.gid(24), tests.u(68), 'Antigua');

-- ===================================================== A. structure, grants, RLS
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity
  and relname in ('group_fines', 'group_fine_votes', 'group_fine_members', 'group_fund_debts', 'group_checkin_rejections')), 5,
  'A1 the five new tables exist with row level security on');
select is((select count(*)::int from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
    and table_name in ('group_fines', 'group_fine_votes', 'group_fine_members', 'group_fund_debts', 'group_checkin_rejections')), 0,
  'A2 no client role holds any privilege on them');
select is((select count(*)::int from pg_policy where polrelid in ('public.group_fines'::regclass, 'public.group_fine_votes'::regclass,
  'public.group_fine_members'::regclass, 'public.group_fund_debts'::regclass, 'public.group_checkin_rejections'::regclass)), 0,
  'A3 they have no policy at all');
select is((select bool_and(tests.denied(r, format('select 1 from public.%I limit 1', t)))
  from unnest(array['group_fines', 'group_fine_votes', 'group_fine_members', 'group_fund_debts', 'group_checkin_rejections']) t, unnest(array['authenticated', 'anon']) r),
  true, 'A4 authenticated and anon cannot SELECT any of them');
select is((select bool_and(tests.denied(r, format('insert into public.%I default values', t)))
  from unnest(array['group_fines', 'group_fine_votes', 'group_fine_members', 'group_fund_debts', 'group_checkin_rejections']) t, unnest(array['authenticated', 'anon']) r),
  true, 'A5 authenticated and anon cannot INSERT into any of them');
select is((select bool_and(tests.denied(r, format('update public.%I set %I = %I', v.t, v.c, v.c)))
  from (values ('group_fines', 'amount'), ('group_fine_votes', 'accepted'), ('group_fine_members', 'bound_until'),
               ('group_fund_debts', 'paid_at'), ('group_checkin_rejections', 'reason')) v(t, c), unnest(array['authenticated', 'anon']) r),
  true, 'A6 authenticated and anon cannot UPDATE any of them (a debt cannot be marked paid directly)');
select is((select bool_and(tests.denied(r, format('delete from public.%I', t)))
  from unnest(array['group_fines', 'group_fine_votes', 'group_fine_members', 'group_fund_debts', 'group_checkin_rejections']) t, unnest(array['authenticated', 'anon']) r),
  true, 'A7 authenticated and anon cannot DELETE from any of them');
select is((select bool_and(has_function_privilege('authenticated', p, 'execute') and not has_function_privilege('anon', p, 'execute')
                           and not has_function_privilege('public', p, 'execute'))
  from unnest(array[
    'public.propose_group_fine(uuid,integer,text)', 'public.vote_group_fine(uuid,boolean)', 'public.accept_group_fine(uuid)',
    'public.leave_group_fine(uuid)', 'public.end_group_fine(uuid)', 'public.set_group_debt_paid(uuid,boolean)',
    'public.reject_group_checkin(uuid,uuid,text)', 'public.undo_group_checkin_rejection(uuid,uuid)',
    'public.group_fine_state(uuid)', 'public.group_fund(uuid)', 'public.my_fund_debts()', 'public.group_rejected_checkins(uuid)']) p),
  true, 'A8 every new client RPC is executable by authenticated only');
select is((select bool_or(has_function_privilege(r, p, 'execute'))
  from unnest(array['public.groups_fine_accepted(uuid)', 'public.groups_fine_activate(uuid, timestamptz)',
                    'public.groups_expire_fines(uuid, timestamptz)', 'public.groups_fine_for_week(uuid, date)',
                    'public.groups_end_fine_binding()', 'public.groups_note_admin_reduced()']) p, unnest(array['authenticated', 'anon', 'public']) r),
  false, 'A9 the new internal helpers are not executable by clients');
select ok(has_function_privilege('service_role', 'public.close_due_group_weeks(timestamp with time zone)', 'execute')
  and not has_function_privilege('authenticated', 'public.close_due_group_weeks(timestamp with time zone)', 'execute')
  and not has_function_privilege('anon', 'public.close_due_group_weeks(timestamp with time zone)', 'execute')
  and not has_function_privilege('public', 'public.close_due_group_weeks(timestamp with time zone)', 'execute'),
  'A10 the closing function is still service_role only');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and p.proname in ('propose_group_fine', 'vote_group_fine', 'accept_group_fine', 'leave_group_fine', 'end_group_fine', 'set_group_debt_paid',
    'reject_group_checkin', 'undo_group_checkin_rejection', 'group_fine_state', 'group_fund', 'my_fund_debts', 'group_rejected_checkins',
    'groups_fine_accepted', 'groups_fine_activate', 'groups_expire_fines', 'groups_fine_for_week', 'groups_end_fine_binding',
    'groups_note_admin_reduced', 'group_invite_fine_for', 'group_invite_lookup')
  and coalesce(p.proconfig @> array['search_path=""'], false)), 20,
  'A11 all twenty new SECURITY DEFINER functions pin search_path to empty');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('propose_group_fine', 'vote_group_fine', 'accept_group_fine', 'leave_group_fine', 'end_group_fine', 'set_group_debt_paid',
    'reject_group_checkin', 'undo_group_checkin_rejection', 'group_fine_state', 'group_fund', 'my_fund_debts', 'group_rejected_checkins',
    'groups_fine_accepted', 'groups_fine_activate', 'groups_expire_fines', 'groups_fine_for_week', 'groups_end_fine_binding',
    'groups_note_admin_reduced', 'group_invite_fine_for', 'group_invite_lookup', 'group_proof_readable', 'groups_close_group',
    'close_due_group_weeks', 'groups_close_week') and p.prosrc ~* '\mexecute\M'), 0, 'A12 none of them uses dynamic SQL');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('propose_group_fine', 'vote_group_fine', 'accept_group_fine', 'leave_group_fine', 'end_group_fine', 'set_group_debt_paid',
    'reject_group_checkin', 'undo_group_checkin_rejection', 'group_fine_state', 'group_fund', 'my_fund_debts', 'group_rejected_checkins',
    'groups_fine_accepted', 'groups_fine_activate', 'groups_expire_fines', 'groups_fine_for_week', 'groups_end_fine_binding',
    'groups_note_admin_reduced', 'group_invite_fine_for', 'group_invite_lookup', 'group_proof_readable', 'groups_close_group',
    'close_due_group_weeks', 'groups_close_week') and p.prosrc || coalesce(obj_description(p.oid, 'pg_proc'), '') ~* '(\mapuesta|\mbet\M|\mpozo)'), 0,
  'A13 the three forbidden words appear in none of the new function bodies');
select has_trigger('public', 'group_members', 'group_members_end_fine_binding', 'A14 membership changes end fine bindings');
select is((select count(*)::int from pg_trigger t where t.tgrelid in ('public.group_fines'::regclass, 'public.group_fine_votes'::regclass,
  'public.group_fine_members'::regclass, 'public.group_fund_debts'::regclass, 'public.group_checkin_rejections'::regclass)
  and t.tgname like '%_forbid_deleted_actor'), 5, 'A15 the new tables join the deleted-account guard');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'group_weeks'
  and column_name in ('fine_id', 'fine_amount')), 2, 'A16 group_weeks gains fine_id and fine_amount');
-- constraints, written as the owner
select throws_ok($$ insert into public.group_fines (group_id, amount, purpose, proposed_by, eligible_count, status)
  values (tests.gid(1), 0, 'x', tests.u(1), 1, 'proposed') $$, '23514', null, 'A17 an amount of 0 is refused by the table');
select throws_ok($$ insert into public.group_fines (group_id, amount, purpose, proposed_by, eligible_count, status)
  values (tests.gid(1), 100001, 'x', tests.u(1), 1, 'proposed') $$, '23514', null, 'A18 an amount over 100000 is refused by the table');
select throws_ok($$ insert into public.group_fines (group_id, amount, purpose, proposed_by, eligible_count, status)
  values (tests.gid(1), 5, repeat('x', 81), tests.u(1), 1, 'proposed') $$, '23514', null, 'A19 a purpose over 80 characters is refused');
select throws_ok($$ insert into public.group_fines (group_id, amount, purpose, proposed_by, eligible_count, status)
  values (tests.gid(1), 5, 'x', tests.u(1), 1, 'borrador') $$, '23514', null, 'A20 an unknown status is refused');
select throws_ok($$ insert into public.group_fine_members (group_id, fine_id, user_id, bound_from) values (tests.gid(21), tests.gid(121), tests.u(62), date '2026-11-25') $$,
  '23514', null, 'A21 a binding must start on a Monday');
select throws_ok($$ insert into public.group_fund_debts (group_id, fine_id, week_start, debtor_id, amount)
  values (tests.gid(21), tests.gid(121), tests.wk() - 14, tests.u(62), 1000) $$, '23505', null, 'A22 one debt per group, week and debtor');
select throws_ok($$ insert into public.group_fund_debts (group_id, fine_id, week_start, debtor_id, amount, paid_at)
  values (tests.gid(21), tests.gid(121), tests.wk() - 21, tests.u(63), 1000, now()) $$, '23514', null, 'A23 paid_at and paid_by go together');
select throws_ok($$ insert into public.group_fines (group_id, amount, purpose, proposed_by, eligible_count, status)
  values (tests.gid(21), 5, 'x', tests.u(61), 1, 'active') $$, '23514', null, 'A24 an active fine needs its start date');
select throws_ok($$ insert into public.group_fines (group_id, amount, purpose, proposed_by, eligible_count, status, starts_on)
  values (tests.gid(21), 5, 'x', tests.u(61), 3, 'active', tests.wk()) $$, '23505', null, 'A25 at most one active fine per group');


select is((select count(*)::int from information_schema.columns where table_schema = 'public'
  and ((table_name = 'groups' and column_name = 'admin_reduced_at') or (table_name = 'group_week_results' and column_name = 'bound'))), 2,
  'A26 groups.admin_reduced_at and group_week_results.bound exist');
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'group_week_results' and column_name = 'bound'),
  'false', 'A27 bound is false for every row that was written before 0025');
select has_trigger('public', 'group_members', 'group_members_note_admin_reduced', 'A28 an admin stopping being one is timestamped');
select ok(has_function_privilege('service_role', 'public.group_invite_fine_for(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.group_invite_fine_for(text)', 'execute')
  and not has_function_privilege('anon', 'public.group_invite_fine_for(text)', 'execute')
  and not has_function_privilege('public', 'public.group_invite_fine_for(text)', 'execute'), 'A29 group_invite_fine_for is service_role only');
select ok(has_function_privilege('service_role', 'public.group_invite_lookup(text,uuid,text,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.group_invite_lookup(text,uuid,text,integer,integer)', 'execute')
  and not has_function_privilege('anon', 'public.group_invite_lookup(text,uuid,text,integer,integer)', 'execute')
  and not has_function_privilege('public', 'public.group_invite_lookup(text,uuid,text,integer,integer)', 'execute'), 'A30 group_invite_lookup is service_role only');
select ok(has_function_privilege('authenticated', 'public.group_proof_readable(text)', 'execute')
  and not has_function_privilege('anon', 'public.group_proof_readable(text)', 'execute')
  and not has_function_privilege('public', 'public.group_proof_readable(text)', 'execute'), 'A31 the replaced proofs helper keeps its grants');
select ok((select p.prosrc ~ 'group_checkin_rejections' from pg_proc p where p.proname = 'group_proof_readable' and p.pronamespace = 'public'::regnamespace), 'A32 the proofs helper has the rejection branch');
select ok((select p.prosrc !~ 'groups_expire_fines' from pg_proc p where p.proname = 'close_due_group_weeks'), 'A33 the closing function holds no fine row lock before the group row: it no longer sweeps globally');
select ok((select p.prosrc ~ 'groups_expire_fines' from pg_proc p where p.proname = 'groups_close_group'), 'A34 expiry runs inside the per-group close, after the group row is locked');
select ok((select bool_and(p.prosrc ~ 'pg_advisory_xact_lock') from pg_proc p where p.proname in ('reject_group_checkin', 'undo_group_checkin_rejection')),
  'A35 reject and undo take the same per-group lock the closing function tries');

-- ===================================================== B. no session
set local role authenticated;
select tests.nosession();
select throws_ok(q, '28000', 'not_authenticated', 'B no session: ' || split_part(q, '(', 1)) from unnest(array[
  $$ select public.propose_group_fine(tests.gid(1), 100, 'x') $$,
  $$ select public.vote_group_fine(tests.gid(1), true) $$,
  $$ select public.accept_group_fine(tests.gid(1)) $$,
  $$ select public.leave_group_fine(tests.gid(1)) $$,
  $$ select public.end_group_fine(tests.gid(1)) $$,
  $$ select public.set_group_debt_paid(tests.gid(201), true) $$,
  $$ select public.reject_group_checkin(tests.gid(31), tests.c(83, 1), 'x') $$,
  $$ select public.undo_group_checkin_rejection(tests.gid(31), tests.c(83, 1)) $$,
  $$ select public.group_fine_state(tests.gid(1)) $$,
  $$ select public.group_fund(tests.gid(1)) $$,
  $$ select public.my_fund_debts() $$,
  $$ select * from public.group_rejected_checkins(tests.gid(1)) $$]) q;
reset role;
set local role anon;
select throws_ok($$ select public.propose_group_fine(tests.gid(1), 100, 'x') $$, '42501', null, 'B13 anon cannot call the RPCs at all');
reset role;

-- ===================================================== C. proposal
select tests.as(10);
select throws_ok($$ select public.propose_group_fine(tests.gid(1), 2500, 'Asado') $$, 'P0001', 'group_not_found', 'C1 an outsider proposing gets group_not_found');
select tests.as(12);
select throws_ok($$ select public.propose_group_fine(tests.gid(1), 2500, 'Asado') $$, 'P0001', 'group_not_found', 'C2 someone in no group gets group_not_found');
select tests.as(7);
select throws_ok($$ select public.propose_group_fine(tests.gid(1), 2500, 'Asado') $$, 'P0001', 'group_not_found', 'C3 someone who left gets group_not_found');
select tests.as(8);
select throws_ok($$ select public.propose_group_fine(tests.gid(1), 2500, 'Asado') $$, 'P0001', 'group_not_found', 'C4 someone removed gets group_not_found');
select tests.as(3);
select throws_ok($$ select public.propose_group_fine(tests.gid(1), 2500, 'Asado') $$, 'P0001', 'not_group_admin', 'C5 a member who is not an admin gets not_group_admin');
select tests.as(1);
select throws_ok(format($$ select public.propose_group_fine(tests.gid(1), %s, 'Asado') $$, a), 'P0001', 'invalid_fine', 'C6 invalid amount ' || a)
  from unnest(array['0', '-5', '100001', 'null']) a;
select throws_ok(format($$ select public.propose_group_fine(tests.gid(1), 2500, %s) $$, p), 'P0001', 'invalid_fine', 'C7 invalid purpose ' || left(p, 12))
  from unnest(array['''''', '''   ''', quote_literal(repeat('x', 81)), 'null', quote_literal(E'a\nb')]) p;
select lives_ok($$ select public.propose_group_fine(tests.gid(1), 100000, repeat('x', 80)) $$, 'C8 the limits themselves are valid (100000 and 80 characters)');
-- that one is open now: remove it so the real proposal can be made
reset role;
delete from public.group_fine_votes where fine_id in (select id from public.group_fines where group_id = tests.gid(1));
delete from public.group_fines where group_id = tests.gid(1);
delete from public.notifications where user_id in (select tests.u(g) from generate_series(1, 8) g);
select tests.as(1);
select tests.save('f1', public.propose_group_fine(tests.gid(1), 2500, '  Asado de fin de mes '));
reset role;
select is((select row(amount, purpose, proposed_by, eligible_count, status, starts_on, ends_on, decided_at)::text from public.group_fines where id = tests.g('f1')),
  row(2500, 'Asado de fin de mes', tests.u(1), 6, 'proposed', null::date, null::date, null::timestamptz)::text,
  'C9 the proposal is stored trimmed, with the 6 active members counted and no dates');
select is((select expires_at = proposed_at + interval '7 days' from public.group_fines where id = tests.g('f1')), true, 'C10 it expires 7 days after it was proposed');
select is((select count(*)::int from public.group_fine_votes where fine_id = tests.g('f1') and user_id = tests.u(1) and accepted), 1, 'C11 the proposer''s vote is recorded as accepted');
select tests.as(2);
select throws_ok($$ select public.propose_group_fine(tests.gid(1), 1000, 'Otra') $$, 'P0001', 'fine_pending', 'C12 a second open proposal is refused');
reset role;
select is((select count(*)::int from public.notifications where type = 'group_fine_proposed' and payload->>'group_id' = tests.gid(1)::text), 5, 'C13 the proposal notifies the 5 other active members once');
select is((select array_agg(user_id order by user_id) from public.notifications where type = 'group_fine_proposed' and payload->>'group_id' = tests.gid(1)::text),
  array[tests.u(2), tests.u(3), tests.u(4), tests.u(5), tests.u(6)], 'C14 not the proposer, not someone who left or was removed');
select is((select string_agg(k, ',' order by k collate "C") from (select distinct jsonb_object_keys(payload) k from public.notifications where type = 'group_fine_proposed' and payload->>'group_id' = tests.gid(1)::text) s),
  'amount,group_id,group_name,purpose', 'C15 the payload has exactly group_id, group_name, amount and purpose');
select is((select payload->>'amount' || '/' || (payload->>'purpose') from public.notifications where type = 'group_fine_proposed' and payload->>'group_id' = tests.gid(1)::text limit 1), '2500/Asado de fin de mes', 'C16 and the right values');
-- archived group
update public.groups set archived_at = now() where id = tests.gid(23);
select tests.as(64);
select throws_ok($$ select public.propose_group_fine(tests.gid(23), 100, 'x') $$, 'P0001', 'group_archived', 'C17 an archived group takes no proposal');
reset role;

-- thresholds: 1 and 2 members are active at once (the proposer counts), 5 and 6 need 3
select tests.as(21);
select tests.save('fn1', public.propose_group_fine(tests.gid(11), 300, 'Solo'));
select tests.as(31);
select tests.save('fn2', public.propose_group_fine(tests.gid(12), 400, 'Pareja'));
reset role;
select is((select status || '/' || starts_on::text from public.group_fines where id = tests.g('fn1')), 'active/' || tests.nm()::text, 'C18 with 1 member the fine is active at once, from the next Monday');
select is((select status || '/' || starts_on::text from public.group_fines where id = tests.g('fn2')), 'active/' || tests.nm()::text, 'C19 with 2 members one acceptance (the proposer''s) is half, so it is active at once');
select is((select count(*)::int from public.notifications where type = 'group_fine_proposed' and payload->>'group_id' in (tests.gid(11)::text, tests.gid(12)::text)), 0, 'C20 a proposal that passes at once sends no "proposed" notification');
select is((select count(*)::int from public.notifications where type = 'group_fine_active' and payload->>'group_id' = tests.gid(12)::text), 2, 'C21 but every member gets "active"');
select tests.as(41);
select tests.save('fn5', public.propose_group_fine(tests.gid(15), 500, 'Cinco'));
select tests.as(51);
select tests.save('fn6', public.propose_group_fine(tests.gid(16), 600, 'Seis'));
reset role;
select is((select status || '/' || eligible_count from public.group_fines where id = tests.g('fn5')), 'proposed/5', 'C22 with 5 members one acceptance is not enough');
select is((select status || '/' || eligible_count from public.group_fines where id = tests.g('fn6')), 'proposed/6', 'C23 with 6 members one acceptance is not enough');
select tests.as(42);
select lives_ok($$ select public.vote_group_fine(tests.g('fn5'), true) $$, 'C24 second acceptance in the group of 5');
select tests.as(52);
select lives_ok($$ select public.vote_group_fine(tests.g('fn6'), true) $$, 'C25 second acceptance in the group of 6');
reset role;
select is((select status from public.group_fines where id = tests.g('fn5')), 'proposed', 'C26 2 of 5 is under half rounded up (3)');
select is((select status from public.group_fines where id = tests.g('fn6')), 'proposed', 'C27 2 of 6 is under 3');
select tests.as(43);
select public.vote_group_fine(tests.g('fn5'), true);
select tests.as(53);
select public.vote_group_fine(tests.g('fn6'), true);
reset role;
select is((select status from public.group_fines where id = tests.g('fn5')), 'active', 'C28 3 of 5 activates');
select is((select status from public.group_fines where id = tests.g('fn6')), 'active', 'C29 3 of 6 activates');
select is((select array_agg(user_id order by user_id) from public.group_fine_members where fine_id = tests.g('fn5')), array[tests.u(41), tests.u(42), tests.u(43)],
  'C30 exactly those who accepted are bound (group of 5)');

-- ===================================================== D. voting in the main group (fine f1: needs 3 of 6)
select tests.as(10);
select throws_ok($$ select public.vote_group_fine(tests.g('f1'), true) $$, 'P0001', 'group_not_found', 'D1 an outsider voting on this fine gets group_not_found');
select tests.as(7);
select throws_ok($$ select public.vote_group_fine(tests.g('f1'), true) $$, 'P0001', 'group_not_found', 'D2 someone who left gets group_not_found');
select tests.as(1);
select throws_ok($$ select public.vote_group_fine(tests.g('fn5'), true) $$, 'P0001', 'group_not_found', 'D3 voting on another group''s fine gets group_not_found');
select throws_ok($$ select public.vote_group_fine(tests.gid(999), true) $$, 'P0001', 'fine_not_found', 'D4 an unknown fine is fine_not_found');
select throws_ok($$ select public.vote_group_fine(tests.g('f1'), null) $$, 'P0001', 'invalid_fine', 'D4b a null vote is refused');
select tests.as(3);
select public.vote_group_fine(tests.g('f1'), true);
select is(public.group_fine_state(tests.gid(1))->'proposal'->>'accepted_count', '2', 'D5 an acceptance counts (2 of 3 needed)');
select is(public.group_fine_state(tests.gid(1))->'proposal'->>'my_vote', 'true', 'D6 and the voter sees their vote');
select public.vote_group_fine(tests.g('f1'), true);
select is(public.group_fine_state(tests.gid(1))->'proposal'->>'accepted_count', '2', 'D7 voting twice counts once');
select public.vote_group_fine(tests.g('f1'), false);
select is(public.group_fine_state(tests.gid(1))->'proposal'->>'accepted_count', '1', 'D8 the vote can be changed to a refusal');
select is(public.group_fine_state(tests.gid(1))->'proposal'->>'my_vote', 'false', 'D9 which reads back as false');
select public.vote_group_fine(tests.g('f1'), true);
select tests.as(5);
select is(public.group_fine_state(tests.gid(1))->'proposal'->>'my_vote', null, 'D10 someone who has not voted has a null vote');
select tests.as(3);
-- 03 leaves between voting and activation
select public.leave_group(tests.gid(1));
select tests.as(1);
select is(public.group_fine_state(tests.gid(1))->'proposal'->>'accepted_count', '1', 'D11 a vote of someone who left no longer counts');
select tests.as(4);
select public.vote_group_fine(tests.g('f1'), true);
reset role;
select is((select status from public.group_fines where id = tests.g('f1')), 'proposed', 'D12 2 of 3 needed: still a proposal (the one who left was not counted)');
select tests.as(5);
select public.vote_group_fine(tests.g('f1'), true);
reset role;
select is((select status || '/' || starts_on::text from public.group_fines where id = tests.g('f1')), 'active/' || tests.nm()::text, 'D13 the third acceptance activates it from the next Monday');
select isnt((select decided_at from public.group_fines where id = tests.g('f1')), null, 'D14 and records when it was decided');
select is((select array_agg(user_id order by user_id) from public.group_fine_members where fine_id = tests.g('f1')),
  array[tests.u(1), tests.u(4), tests.u(5)], 'D15 bound: exactly those who accepted and are still members (not 03 who left, not 02 or 06 who never voted)');
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f1') and bound_from = tests.nm() and bound_until is null), 3, 'D16 all from the next Monday, open ended');
select is((select count(*)::int from public.notifications where type = 'group_fine_active' and payload->>'group_id' = tests.gid(1)::text), 5, 'D17 "active" goes to each of the 5 active members once');
select is((select array_agg(user_id order by user_id) from public.notifications where type = 'group_fine_active' and payload->>'group_id' = tests.gid(1)::text),
  array[tests.u(1), tests.u(2), tests.u(4), tests.u(5), tests.u(6)], 'D18 not to the one who left');
select is((select string_agg(k, ',' order by k collate "C") from (select distinct jsonb_object_keys(payload) k from public.notifications where type = 'group_fine_active') s),
  'amount,group_id,group_name', 'D19 its payload has exactly group_id, group_name and amount');
select tests.as(6);
select throws_ok($$ select public.vote_group_fine(tests.g('f1'), true) $$, 'P0001', 'fine_closed', 'D20 a vote after it was decided is refused (the second racer)');
reset role;
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f1')), 3, 'D21 and binds nobody else');
select is((select count(*)::int from public.notifications where type = 'group_fine_active' and payload->>'group_id' = tests.gid(1)::text), 5, 'D22 and does not notify again (it activated exactly once)');
select is((select count(*)::int from public.group_fine_votes where fine_id = tests.g('f1') and user_id = tests.u(6)), 0, 'D23 the refused vote left no row');
-- a vote cannot be made on a fine that is not proposed
select tests.as(2);
select throws_ok($$ select public.vote_group_fine(tests.g('f1'), false) $$, 'P0001', 'fine_closed', 'D24 nor change the vote of an active fine');

-- a new proposal while f1 is in force; it expires without passing and f1 stays untouched
select tests.as(2);
select tests.save('f2', public.propose_group_fine(tests.gid(1), 1000, 'Fondo viaje'));
reset role;
select is((select eligible_count from public.group_fines where id = tests.g('f2')), 5, 'D25 5 active members are counted now (03 left)');
update public.group_fines set proposed_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = tests.g('f2');
select tests.as(4);
select throws_ok($$ select public.vote_group_fine(tests.g('f2'), true) $$, 'P0001', 'fine_closed', 'D26 voting after the 7 days is refused');
select is(public.group_fine_state(tests.gid(1))->'proposal', 'null'::jsonb, 'D27 an expired proposal is not shown');
reset role;
update public.group_fines set proposed_at = now() - interval '7 days', expires_at = now() where id = tests.g('f2');
select tests.as(4);
select throws_ok($$ select public.vote_group_fine(tests.g('f2'), true) $$, 'P0001', 'fine_closed', 'D28 at exactly 7 days it is closed');
reset role;
update public.group_fines set proposed_at = now() - interval '7 days' + interval '1 minute', expires_at = now() + interval '1 minute' where id = tests.g('f2');
select tests.as(4);
select lives_ok($$ select public.vote_group_fine(tests.g('f2'), true) $$, 'D29 one minute before the 7 days it still takes votes');
-- the next proposal (by an admin) sweeps the stale one first
reset role;
update public.group_fines set proposed_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = tests.g('f2');
delete from public.notifications where type in ('group_fine_expired', 'group_fine_proposed');
select tests.as(1);
select tests.save('f3', public.propose_group_fine(tests.gid(1), 1500, 'Fondo F3'));
reset role;
select is((select status from public.group_fines where id = tests.g('f2')), 'expired', 'D30 the stale proposal became expired when the next one was made');
select is((select count(*)::int from public.notifications where type = 'group_fine_expired' and payload->>'group_id' = tests.gid(1)::text), 5, 'D31 its expiry notified the 5 active members once');
select is((select string_agg(k, ',' order by k collate "C") from (select distinct jsonb_object_keys(payload) k from public.notifications where type = 'group_fine_expired') s),
  'amount,group_id,group_name', 'D32 with exactly group_id, group_name and amount');
select is((select status from public.group_fines where id = tests.g('f1')), 'active', 'D33 the fine in force stayed as it was');
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f1') and bound_until is null), 3, 'D34 with its bindings');
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f2')), 0, 'D35 an expired proposal binds nobody');

-- supersede: f1 has been in force for two weeks, f3 (1500) passes with 2, 4 and the proposer 1
select tests.age(tests.gid(1), 14, tests.g('f1'));
select tests.as(2);
select public.vote_group_fine(tests.g('f3'), true);
select tests.as(4);
select public.vote_group_fine(tests.g('f3'), true);
reset role;
select is((select status || '/' || starts_on::text from public.group_fines where id = tests.g('f3')), 'active/' || tests.nm()::text, 'D36 f3 is active from the next Monday');
select is((select status || '/' || ends_on::text from public.group_fines where id = tests.g('f1')), 'superseded/' || tests.nm()::text, 'D37 f1 is superseded and ends the same Monday');
select is((select array_agg(user_id order by user_id) from public.group_fine_members where fine_id = tests.g('f3')), array[tests.u(1), tests.u(2), tests.u(4)],
  'D38 f3 binds who accepted it, from the next Monday (02 is bound again, 05 is not)');
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f1') and bound_until = tests.nm()), 3,
  'D39 every binding of f1 ends that Monday, including 05 who did not accept the new one');
select is((select count(*)::int from public.group_fines where group_id = tests.gid(1) and status = 'active'), 1, 'D40 exactly one active fine');
select is((select count(*)::int from public.notifications where type = 'group_fine_active' and payload->>'group_id' = tests.gid(1)::text and payload->>'amount' = '1500'), 5,
  'D41 the new fine notified the active members once');
select tests.as(5);
select is(public.group_fine_state(tests.gid(1))->'active'->>'amount', '1500', 'D42 the state shows the new amount');
select is(public.group_fine_state(tests.gid(1))->'active'->>'i_am_bound', 'false', 'D43 05 is not bound to it');
select tests.as(2);
select is(public.group_fine_state(tests.gid(1))->'active'->>'i_am_bound', 'true', 'D44 02 is');
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(public.group_fine_state(tests.gid(1))->'active') k),
  'amount,bound_count,ends_on,i_am_bound,id,my_bound_from,my_bound_until,purpose,starts_on', 'D45 the active object has exactly the listed keys');
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(public.group_fine_state(tests.gid(1))) k), 'active,proposal,single_admin', 'D46 the state has exactly active, proposal and single_admin');
select is(public.group_fine_state(tests.gid(1))->'active'->>'bound_count', '3', 'D47 three people take part');
select is(public.group_fine_state(tests.gid(1))->>'single_admin', 'false', 'D48 two admins: not a single admin');
reset role;
-- the proposal object of a fresh proposal has exactly its keys
select tests.as(1);
select tests.save('f4', public.propose_group_fine(tests.gid(1), 900, 'Cuarta'));
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(public.group_fine_state(tests.gid(1))->'proposal') k),
  'accepted_count,amount,expires_at,id,my_vote,needed_count,proposed_by_name,purpose', 'D49 the proposal object has exactly the listed keys');
select is(public.group_fine_state(tests.gid(1))->'proposal'->>'needed_count', '3', 'D50 needed is half of the 5 rounded up');
select is(public.group_fine_state(tests.gid(1))->'proposal'->>'proposed_by_name', (select display_name from public.profiles where id = tests.u(1)), 'D51 and names the proposer');
select tests.as(10);
select throws_ok($$ select public.group_fine_state(tests.gid(1)) $$, 'P0001', 'group_not_found', 'D52 an outsider cannot read the state');
select tests.as(7);
select throws_ok($$ select public.group_fine_state(tests.gid(1)) $$, 'P0001', 'group_not_found', 'D53 nor someone who left');
select tests.as(21);
select is(public.group_fine_state(tests.gid(11))->>'single_admin', 'true', 'D54 a group with one admin says so');
reset role;
-- the fine proposed last stays open; end it by expiry so later tests start clean
update public.group_fines set proposed_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = tests.g('f4');

-- ===================================================== E. joining, stepping out, ending (f3 has been in force for a week)
select tests.age(tests.gid(1), 7);
-- 05 did not accept f3
select tests.as(5);
select public.accept_group_fine(tests.gid(1));
select is(public.group_fine_state(tests.gid(1))->'active'->>'my_bound_from', tests.nm()::text, 'E1 accepting later binds from the next Monday');
select throws_ok($$ select public.accept_group_fine(tests.gid(1)) $$, 'P0001', 'already_bound', 'E2 accepting twice is already_bound');
select tests.as(3);
select throws_ok($$ select public.accept_group_fine(tests.gid(1)) $$, 'P0001', 'group_not_found', 'E3 someone who left gets group_not_found');
select tests.as(10);
select throws_ok($$ select public.accept_group_fine(tests.gid(1)) $$, 'P0001', 'group_not_found', 'E4 an outsider gets group_not_found');
select throws_ok($$ select public.leave_group_fine(tests.gid(1)) $$, 'P0001', 'group_not_found', 'E5 and cannot step out either');
select tests.as(6);
select throws_ok($$ select public.leave_group_fine(tests.gid(1)) $$, 'P0001', 'not_bound', 'E6 stepping out without being bound is not_bound');
select public.accept_group_fine(tests.gid(1));
select public.leave_group_fine(tests.gid(1));
reset role;
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f3') and user_id = tests.u(6)), 0, 'E7 stepping out before a binding began leaves no binding at all');
select tests.as(4);
select is(public.group_fine_state(tests.gid(1))->'active'->>'my_bound_from', (tests.nm() - 7)::text, 'E8 04 has been bound since the Monday before');
select public.leave_group_fine(tests.gid(1));
select is(public.group_fine_state(tests.gid(1))->'active'->>'my_bound_until', tests.nm()::text, 'E9 stepping out ends from the next Monday, never retroactively');
select is(public.group_fine_state(tests.gid(1))->'active'->>'i_am_bound', 'true', 'E10 so the running week is still bound');
select throws_ok($$ select public.leave_group_fine(tests.gid(1)) $$, 'P0001', 'not_bound', 'E11 stepping out twice is not_bound');
select public.accept_group_fine(tests.gid(1));
reset role;
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f3') and user_id = tests.u(4) and bound_until is null), 1, 'E12 changing their mind before the Monday reopens the same binding');
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f3') and user_id = tests.u(4)), 1, 'E13 without a second row');
-- the trigger: leaving the group (02) and being removed (04) end the bindings from the next Monday
select tests.as(2);
select public.leave_group(tests.gid(1));
select tests.as(1);
select public.remove_group_member(tests.gid(1), tests.u(4));
reset role;
select is((select bound_until from public.group_fine_members where fine_id = tests.g('f3') and user_id = tests.u(2)), tests.nm(), 'E14 a member who leaves the group is unbound from the next Monday');
select is((select bound_until from public.group_fine_members where fine_id = tests.g('f3') and user_id = tests.u(4)), tests.nm(), 'E15 so is one an admin removes');
select tests.as(5);
select throws_ok($$ select public.end_group_fine(tests.gid(1)) $$, 'P0001', 'not_group_admin', 'E16 a member cannot end the fine');
select tests.as(10);
select throws_ok($$ select public.end_group_fine(tests.gid(1)) $$, 'P0001', 'group_not_found', 'E17 an outsider gets group_not_found');
select tests.as(1);
select public.end_group_fine(tests.gid(1));
reset role;
select is((select status || '/' || ends_on::text from public.group_fines where id = tests.g('f3')), 'ended/' || tests.nm()::text, 'E18 an admin ends the fine from the next Monday, no vote');
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f3') and bound_until is null), 0, 'E19 every open binding ends then');
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('f3') and user_id = tests.u(5)), 0, 'E20 a binding that had not begun is dropped');
select tests.as(1);
select throws_ok($$ select public.end_group_fine(tests.gid(1)) $$, 'P0001', 'no_active_fine', 'E21 ending twice is no_active_fine');
select tests.as(5);
select throws_ok($$ select public.accept_group_fine(tests.gid(1)) $$, 'P0001', 'no_active_fine', 'E22 nobody can join an ended fine');
select throws_ok($$ select public.leave_group_fine(tests.gid(1)) $$, 'P0001', 'no_active_fine', 'E23 nor step out of it');
select is(public.group_fine_state(tests.gid(1))->'active'->>'ends_on', tests.nm()::text, 'E24 until that Monday the state still shows it, with its end date');
reset role;
select tests.age(tests.gid(1), 7);
select tests.as(5);
select is(public.group_fine_state(tests.gid(1))->'active', 'null'::jsonb, 'E25 after that Monday there is no active fine');
reset role;
-- a new proposal is possible again and an unrelated group never sees any of this
select tests.as(11);
select throws_ok($$ select public.accept_group_fine(tests.gid(2)) $$, 'P0001', 'no_active_fine', 'E26 a group that never had a fine has no active fine');
reset role;

-- ===================================================== E2. a vote cast before someone left and came back is stale
-- Gv: 141 admin, 142..146 members (6 active, 3 needed). 142 votes, leaves, and is a member again from a later instant.
select tests.grp(tests.gid(17), 'Votos viejos', 141), tests.mem(tests.gid(17), 141, 'admin'), tests.mem(tests.gid(17), 142), tests.mem(tests.gid(17), 143),
       tests.mem(tests.gid(17), 144), tests.mem(tests.gid(17), 145), tests.mem(tests.gid(17), 146);
select tests.as(141);
select tests.save('fv', public.propose_group_fine(tests.gid(17), 700, 'Votos'));
select tests.as(142);
select public.vote_group_fine(tests.g('fv'), true);
reset role;
update public.group_members set left_at = now(), left_reason = 'left', is_live = false where group_id = tests.gid(17) and user_id = tests.u(142);
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from)
values (tests.gid(17), tests.u(142), 'member', tests.h(142, 1), now() - interval '1 hour', tests.today(), tests.nm());
update public.group_fine_votes set voted_at = now() - interval '2 hours' where fine_id = tests.g('fv') and user_id = tests.u(142);
select tests.as(143);
select public.vote_group_fine(tests.g('fv'), true);
select tests.as(142);
select is(public.group_fine_state(tests.gid(17))->'proposal'->>'my_vote', null, 'E26b my_vote does not show a vote that does not count (it was cast before they came back)');
reset role;
select is((select status from public.group_fines where id = tests.g('fv')), 'proposed', 'E27 the old vote of someone who left and came back does not count (2 of 3)');
select tests.as(142);
select public.vote_group_fine(tests.g('fv'), true);
reset role;
select is((select status from public.group_fines where id = tests.g('fv')), 'active', 'E28 once they vote again it does (3 of 3)');


-- ===================================================== E3. members who joined after the proposal cannot tip the vote (M1)
-- Gl: 161 admin, 162..165: 5 members, 3 needed. Two people join after the proposal and accept.
select tests.grp(tests.gid(18), 'Tarde', 161), tests.mem(tests.gid(18), 161, 'admin'), tests.mem(tests.gid(18), 162), tests.mem(tests.gid(18), 163),
       tests.mem(tests.gid(18), 164), tests.mem(tests.gid(18), 165);
select tests.as(161);
select tests.save('fl', public.propose_group_fine(tests.gid(18), 400, 'Tarde'));
reset role;
update public.group_fines set proposed_at = now() - interval '2 hours', expires_at = now() - interval '2 hours' + interval '7 days' where id = tests.g('fl');
update public.group_fine_votes set voted_at = now() - interval '2 hours' where fine_id = tests.g('fl');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from)
select tests.gid(18), tests.u(u), 'member', tests.h(u, 1), now() - interval '1 hour', tests.today(), tests.nm() from unnest(array[166, 167]) u;
select tests.as(166);
select public.vote_group_fine(tests.g('fl'), true);
select tests.as(167);
select public.vote_group_fine(tests.g('fl'), true);
reset role;
select is((select status from public.group_fines where id = tests.g('fl')), 'proposed', 'E29 two late joiners accepting (3 raw acceptances of 5) do not activate the fine');
select tests.as(161);
select is(public.group_fine_state(tests.gid(18))->'proposal'->>'accepted_count', '1', 'E30 and only the proposer counts toward the threshold');
select tests.as(162);
select public.vote_group_fine(tests.g('fl'), true);
select tests.as(163);
select public.vote_group_fine(tests.g('fl'), true);
reset role;
select is((select status from public.group_fines where id = tests.g('fl')), 'active', 'E31 it activates when 3 of the members counted at proposal time accept');
select is((select array_agg(user_id order by user_id) from public.group_fine_members where fine_id = tests.g('fl')),
  array[tests.u(161), tests.u(162), tests.u(163), tests.u(166), tests.u(167)], 'E32 and the late joiners who accepted are bound too');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from)
values (tests.gid(18), tests.u(168), 'member', tests.h(168, 1), now(), tests.today(), tests.nm());
select tests.as(168);
select lives_ok($$ select public.accept_group_fine(tests.gid(18)) $$, 'E33 a late joiner can still accept the ACTIVE fine');
reset role;
select is((select count(*)::int from public.group_fine_members where fine_id = tests.g('fl') and user_id = tests.u(168)), 1, 'E34 and is bound');

-- ===================================================== F. marking debts paid
select tests.as(62);
select throws_ok($$ select public.set_group_debt_paid(tests.gid(201), true) $$, 'P0001', 'not_group_admin', 'F1 a member who is not an admin gets not_group_admin');
select tests.as(10);
select throws_ok($$ select public.set_group_debt_paid(tests.gid(201), true) $$, 'P0001', 'group_not_found', 'F2 an outsider gets group_not_found');
select tests.as(71);
select throws_ok($$ select public.set_group_debt_paid(tests.gid(201), true) $$, 'P0001', 'group_not_found', 'F3 an admin of another group cannot mark this group''s debt');
select tests.as(61);
select throws_ok($$ select public.set_group_debt_paid(tests.gid(999), true) $$, 'P0001', 'debt_not_found', 'F4 an unknown debt is debt_not_found');
select throws_ok($$ select public.set_group_debt_paid(tests.gid(201), null) $$, 'P0001', 'invalid_fine', 'F5 a null mark is refused');
select throws_ok($$ select public.set_group_debt_paid(tests.gid(204), true) $$, 'P0001', 'group_not_found', 'F6 the other group''s debt is not found for them either');
select public.set_group_debt_paid(tests.gid(201), true);
reset role;
select is((select paid_by from public.group_fund_debts where id = tests.gid(201)), tests.u(61), 'F7 an admin marks a debt paid and it records who');
select isnt((select paid_at from public.group_fund_debts where id = tests.gid(201)), null, 'F8 and when');
update public.group_fund_debts set paid_at = paid_at - interval '1 day' where id = tests.gid(201);
select tests.as(61);
select public.set_group_debt_paid(tests.gid(201), true);
reset role;
select is((select paid_at < now() - interval '12 hours' from public.group_fund_debts where id = tests.gid(201)), true, 'F9 marking it again keeps the first mark');
select tests.as(61);
select public.set_group_debt_paid(tests.gid(201), false);
reset role;
select is((select row(paid_at, paid_by)::text from public.group_fund_debts where id = tests.gid(201)), row(null::timestamptz, null::uuid)::text, 'F10 unmarking clears both');
select tests.as(61);
select lives_ok($$ select public.set_group_debt_paid(tests.gid(202), true) $$, 'F11 the only admin may mark their own debt (nobody else could)');
-- two admins
select tests.as(71);
select throws_ok($$ select public.set_group_debt_paid(tests.gid(205), true) $$, 'P0001', 'own_debt', 'F12 with another admin, an admin cannot mark their own debt');
select throws_ok($$ select public.set_group_debt_paid(tests.gid(205), false) $$, 'P0001', 'own_debt', 'F13 nor unmark it');
select lives_ok($$ select public.set_group_debt_paid(tests.gid(204), true) $$, 'F14 but marks someone else''s');
select tests.as(72);
select throws_ok($$ select public.set_group_debt_paid(tests.gid(206), true) $$, 'P0001', 'own_debt', 'F15 the other admin has the same rule');
select lives_ok($$ select public.set_group_debt_paid(tests.gid(205), true) $$, 'F16 and marks the first admin''s debt');
reset role;
select is((select paid_by from public.group_fund_debts where id = tests.gid(205)), tests.u(72), 'F17 whose mark shows who made it');
select tests.as(64);
select lives_ok($$ select public.set_group_debt_paid(tests.gid(207), true) $$, 'F18 an admin of an ARCHIVED group can still mark a debt paid');
reset role;
select is((select paid_by from public.group_fund_debts where id = tests.gid(207)), tests.u(64), 'F18b and it records who');

-- ===================================================== F2. the own-debt rule cannot be bypassed (I3)
select tests.as(71);
select lives_ok($$ select public.set_group_admin(tests.gid(22), tests.u(72), false) $$, 'F19 an admin may demote the other admin (0023 rule)');
select throws_ok($$ select public.set_group_debt_paid(tests.gid(209), true) $$, 'P0001', 'own_debt', 'F20 but cannot then mark their own debt: the group had two admins when it was made');
select lives_ok($$ select public.set_group_admin(tests.gid(22), tests.u(72), true) $$, 'F21 re-promoting the other admin');
select throws_ok($$ select public.set_group_debt_paid(tests.gid(209), true) $$, 'P0001', 'own_debt', 'F22 still refused');
reset role;
select isnt((select admin_reduced_at from public.groups where id = tests.gid(22)), null, 'F23 the demotion was timestamped');
select tests.as(74);
select lives_ok($$ select public.remove_group_member(tests.gid(26), tests.u(75)) $$, 'F24 removing the other admin');
select throws_ok($$ select public.set_group_debt_paid(tests.gid(210), true) $$, 'P0001', 'own_debt', 'F25 does not open the bypass either');
select tests.as(66);
select lives_ok($$ select public.set_group_debt_paid(tests.gid(211), true) $$, 'F26 a sole admin whose other admin stopped being one BEFORE the debt may mark their own');
reset role;
select tests.as(75);
select throws_ok($$ select public.set_group_debt_paid(tests.gid(210), true) $$, 'P0001', 'group_not_found', 'F27 a removed admin gets group_not_found');
reset role;

-- ===================================================== F3. an archived group: only the debts stay open
select tests.as(10);
select throws_ok($$ select public.set_group_debt_paid(tests.gid(212), true) $$, 'P0001', 'group_not_found', 'F28 an outsider still gets group_not_found on an archived group');
select tests.as(69);
select throws_ok($$ select public.set_group_debt_paid(tests.gid(212), true) $$, 'P0001', 'not_group_admin', 'F29 a plain member gets not_group_admin');
select tests.as(68);
select lives_ok($$ select public.set_group_debt_paid(tests.gid(212), true) $$, 'F30 its admin marks a debt paid');
select lives_ok($$ select public.set_group_debt_paid(tests.gid(212), false) $$, 'F31 and unmarks it');
select lives_ok($$ select public.set_group_debt_paid(tests.gid(213), true) $$, 'F32 a sole admin may mark their own debt in an archived group');
select throws_ok($$ select public.propose_group_fine(tests.gid(24), 100, 'x') $$, 'P0001', 'group_archived', 'F33 proposing stays refused');
select throws_ok($$ select public.end_group_fine(tests.gid(24)) $$, 'P0001', 'group_archived', 'F34 ending stays refused');
select throws_ok($$ select public.reject_group_checkin(tests.gid(24), tests.c(69, 1), 'Motivo') $$, 'P0001', 'group_archived', 'F35 rejecting a photo stays refused');
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(24), tests.c(69, 2)) $$, 'P0001', 'group_archived', 'F36 undoing a rejection stays refused');
select tests.as(69);
select throws_ok($$ select public.vote_group_fine(tests.gid(127), true) $$, 'P0001', 'group_archived', 'F37 voting stays refused');
select throws_ok($$ select public.accept_group_fine(tests.gid(24)) $$, 'P0001', 'group_archived', 'F38 accepting stays refused');
select throws_ok($$ select public.leave_group_fine(tests.gid(24)) $$, 'P0001', 'group_archived', 'F39 stepping out stays refused');
reset role;
select tests.as(68);
select lives_ok($$ select public.leave_group(tests.gid(24)) $$, 'F40 the archived group admin can leave');
reset role;
select is((select role from public.group_members where group_id = tests.gid(24) and user_id = tests.u(69) and left_at is null), 'admin', 'F41 the longest-standing active member succeeds the departing admin');
select tests.as(69);
select lives_ok($$ select public.set_group_debt_paid(tests.gid(212), true) $$, 'F42 the successor can mark their own debt when the archived group has no alternate admin');
reset role;
select is((select paid_by from public.group_fund_debts where id = tests.gid(212)), tests.u(69), 'F43 the debt records the successor who marked it');

-- ===================================================== G. reads of the fund
select tests.as(63);
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(public.group_fund(tests.gid(21))) k), 'debts,people,totals', 'G1 the fund has exactly totals, people and debts');
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(public.group_fund(tests.gid(21))->'totals') k), 'paid,pending,registered', 'G2 totals has exactly the three keys');
-- GD: debts 201 (62, now unpaid), 202 (61 paid), 203 (62 unpaid), 208 (65, left, paid)
select is(public.group_fund(tests.gid(21))->'totals', '{"registered": 4000, "paid": 2000, "pending": 2000}'::jsonb, 'G3 registered, paid and pending add up');
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys((public.group_fund(tests.gid(21))->'people')->0) k),
  'avatar_path,avatar_preset,display_name,pending,user_id,username', 'G4 a person has exactly the listed keys');
select is(jsonb_array_length(public.group_fund(tests.gid(21))->'people'), 1, 'G5 only active members who owe something are listed');
select is(public.group_fund(tests.gid(21))->'people'->0->>'pending', '2000', 'G6 with what each owes');
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys((public.group_fund(tests.gid(21))->'debts')->0) k),
  'amount,avatar_path,avatar_preset,debt_id,display_name,mine,paid_at,paid_by_name,user_id,username,week_start', 'G7 a debt has exactly the listed keys');
select is(jsonb_array_length(public.group_fund(tests.gid(21))->'debts'), 4, 'G8 every debt is listed, including the one of someone who left');
select tests.as(62);
select is((select count(*)::int from jsonb_array_elements(public.group_fund(tests.gid(21))->'debts') d where (d->>'mine')::boolean), 2, 'G9 "mine" marks the caller''s own debts');
select is((select d->>'paid_by_name' from jsonb_array_elements(public.group_fund(tests.gid(21))->'debts') d where d->>'debt_id' = tests.gid(208)::text),
  tests.val($q$ select display_name from public.profiles where id = tests.u(61) $q$), 'G10 a paid debt names who marked it');
select tests.as(10);
select throws_ok($$ select public.group_fund(tests.gid(21)) $$, 'P0001', 'group_not_found', 'G11 an outsider cannot read the fund');
select tests.as(65);
select throws_ok($$ select public.group_fund(tests.gid(21)) $$, 'P0001', 'group_not_found', 'G12 nor someone who left');
-- my_fund_debts
select tests.as(62);
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(public.my_fund_debts()) k), 'administered,owed', 'G13 my_fund_debts has exactly owed and administered');
select is(public.my_fund_debts()->'owed', jsonb_build_array(jsonb_build_object('group_id', tests.gid(21), 'group_name', 'Fondo uno', 'pending', 2000)), 'G14 what I owe, per group');
select is(public.my_fund_debts()->'administered', '[]'::jsonb, 'G15 a plain member administers nothing');
select tests.as(61);
select is(public.my_fund_debts()->'administered', jsonb_build_array(jsonb_build_object('group_id', tests.gid(21), 'group_name', 'Fondo uno', 'pending', 2000)), 'G16 an admin sees the group''s pending total');
select is(public.my_fund_debts()->'owed', '[]'::jsonb, 'G17 and nothing owed when everything of theirs is paid');
select tests.as(65);
select is(public.my_fund_debts()->'owed', '[]'::jsonb, 'G18 someone who left and paid owes nothing');
reset role;
update public.group_fund_debts set paid_at = null, paid_by = null where id = tests.gid(208);
select tests.as(65);
select is(jsonb_array_length(public.my_fund_debts()->'owed'), 1, 'G19 someone who left still sees what they owe');
select tests.as(10);
select is(public.my_fund_debts(), '{"owed": [], "administered": []}'::jsonb, 'G20 someone with no debts and no groups sees two empty lists');
reset role;


-- ===================================================== G2. group_invite_fine_for and group_invite_lookup (service role)
-- a fine ended before it started never applies (starts_on = ends_on)
select tests.grp(tests.gid(27), 'Nunca', 76), tests.mem(tests.gid(27), 76, 'admin');
insert into public.group_fines (id, group_id, amount, purpose, proposed_by, proposed_at, expires_at, eligible_count, status, starts_on, ends_on, decided_at)
values (tests.gid(128), tests.gid(27), 1700, 'Never', tests.u(76), now() - interval '2 days', now() + interval '5 days', 1, 'ended', tests.nm(), tests.nm(), now());
insert into public.group_invites (code, group_id, created_by, max_uses, uses, expires_at) values
  ('GDGDGDGD', tests.gid(21), tests.u(61), 5, 0, now() + interval '1 day'),
  ('KKKKKKKK', tests.gid(11), tests.u(21), 5, 0, now() + interval '1 day'),
  ('NNNNNNNN', tests.gid(2), tests.u(10), 5, 0, now() + interval '1 day'),
  ('AAAAAAAA', tests.gid(23), tests.u(64), 5, 0, now() + interval '1 day'),
  ('EEEEEEEE', tests.gid(21), tests.u(61), 5, 0, now() - interval '1 hour'),
  ('UUUUUUUU', tests.gid(21), tests.u(61), 1, 1, now() + interval '1 day'),
  ('WWWWWWWW', tests.gid(27), tests.u(76), 5, 0, now() + interval '1 day');
set local role service_role;
select is(public.group_invite_fine_for('GDGDGDGD'), '{"amount": 1000, "purpose": "Asado"}'::jsonb, 'G21 a valid code of a group with a fine in force gives amount and purpose');
select is(public.group_invite_fine_for(E' gdgd-gdgd\n'), '{"amount": 1000, "purpose": "Asado"}'::jsonb, 'G22 the code is normalised like the preview does');
select is(public.group_invite_fine_for('KKKKKKKK'), '{"amount": 300, "purpose": "Solo"}'::jsonb, 'G23 a fine approved to start next Monday counts');
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(public.group_invite_fine_for('GDGDGDGD')) k), 'amount,purpose', 'G24 exactly two keys');
select is(public.group_invite_fine_for('NNNNNNNN'), null, 'G25 a group without a fine gives null');
select is(public.group_invite_fine_for('WWWWWWWW'), null, 'G25b a fine ended before its start never applies, so it is not shown');
select is(public.group_invite_fine_for('AAAAAAAA'), null, 'G26 an archived group gives null');
select is(public.group_invite_fine_for('EEEEEEEE'), null, 'G27 an expired invitation gives null');
select is(public.group_invite_fine_for('UUUUUUUU'), null, 'G28 a used-up invitation gives null');
select is(public.group_invite_fine_for('ZZZZZZZZ'), null, 'G29 an unknown code gives null');
select is(public.group_invite_fine_for('abc'), null, 'G30 a malformed code gives null');
select is(public.group_invite_fine_for(null), null, 'G31 and so does null (it never raises)');
-- the lookup
select throws_ok($$ select public.group_invite_lookup('GDGDGDGD', null, null) $$, 'P0001', 'invalid_key', 'G32 a null key is refused');
select throws_ok($$ select public.group_invite_lookup('GDGDGDGD', null, '') $$, 'P0001', 'invalid_key', 'G33 an empty key is refused');
select throws_ok($$ select public.group_invite_lookup('GDGDGDGD', null, repeat('k', 201)) $$, 'P0001', 'invalid_key', 'G34 a key over 200 characters is refused');
select lives_ok($$ select public.group_invite_lookup('GDGDGDGD', null, repeat('k', 200)) $$, 'G35 200 characters is fine');
select is((select count(*)::int from (select public.group_invite_lookup('ZZZZZZZZ', null, 'key-a') r from generate_series(1, 20)) s
  where r = '{"limited": false, "preview": null}'::jsonb), 20, 'G36 twenty failures are all answered, not limited, preview null');
select is(public.rate_limit('key-a', 20, 900, false), true, 'G37 the generic limiter sees the same twenty failures (same table, same hashed key)');
select is(public.group_invite_lookup('GDGDGDGD', null, 'key-a'), '{"limited": true, "preview": null}'::jsonb, 'G38 the 21st call is limited, even for a valid code, and looks nothing up');
reset role;
select is(tests.val($$ select count(*) from public.rate_limit_events where key_hash = sha256(convert_to('key-a', 'UTF8')) $$), '20', 'G39 a limited call records nothing');
set local role service_role;
select is((select count(*)::int from (select public.group_invite_lookup('GDGDGDGD', null, 'key-b') r from generate_series(1, 30)) s
  where r->>'limited' = 'false' and r->'preview' is not null and r->'preview' <> 'null'::jsonb), 30, 'G40 valid lookups are never limited however many there are');
reset role;
select is(tests.val($$ select count(*) from public.rate_limit_events where key_hash = sha256(convert_to('key-b', 'UTF8')) $$), '0', 'G41 and never counted');
set local role service_role;
select is(public.group_invite_lookup('ZZZZZZZZ', null, 'key-c'), '{"limited": false, "preview": null}'::jsonb, 'G42 another key is independent of the limited one');
reset role;
insert into public.rate_limit_events (key_hash, at) select sha256(convert_to('stale-' || g, 'UTF8')), now() - interval '3 days' from generate_series(1, 10) g;
set local role service_role;
select lives_ok($$ select public.group_invite_lookup('ZZZZZZZZ', null, 'key-s') $$, 'G43a a lookup of another key');
reset role;
select is(tests.val($$ select count(*) from public.rate_limit_events where at < now() - interval '1 day' and key_hash in (select sha256(convert_to('stale-' || g, 'UTF8')) from generate_series(1, 10) g) $$), '0',
  'G43b removed the stale rows of OTHER keys too, like rate_limit does');
set local role service_role;
select is(public.group_invite_lookup('GDGDGDGD', tests.u(61), 'key-c')->'preview', public.group_invite_preview_for('GDGDGDGD', tests.u(61)), 'G43 a found preview is returned unchanged (member keys for a member)');
reset role;
select is(tests.val($$ select count(*) from public.rate_limit_events where key_hash = sha256(convert_to('key-c', 'UTF8')) $$), '1', 'G44 one failure recorded for key-c');
update public.rate_limit_events set at = at - interval '16 minutes' where key_hash = sha256(convert_to('key-a', 'UTF8'));
set local role service_role;
select is(public.group_invite_lookup('GDGDGDGD', null, 'key-a')->>'limited', 'false', 'G45 the window slides: after 15 minutes the key is allowed again');
select is((select count(*)::int from (select public.group_invite_lookup('ZZZZZZZZ', null, 'key-d', 2) r from generate_series(1, 2)) s), 2, 'G46 a custom limit of 2: two failures');
select is(public.group_invite_lookup('GDGDGDGD', null, 'key-d', 2)->>'limited', 'true', 'G47 and the third call is limited');
reset role;
set local role authenticated;
select throws_ok($$ select public.group_invite_lookup('GDGDGDGD', null, 'k') $$, '42501', null, 'G48 authenticated cannot call the lookup');
select throws_ok($$ select public.group_invite_fine_for('GDGDGDGD') $$, '42501', null, 'G49 nor the fine reader');
reset role;
set local role anon;
select throws_ok($$ select public.group_invite_lookup('GDGDGDGD', null, 'k') $$, '42501', null, 'G50 anon cannot call the lookup');
select throws_ok($$ select public.group_invite_fine_for('GDGDGDGD') $$, '42501', null, 'G51 nor the fine reader');
reset role;
select tests.as(76);
select is(public.group_fine_state(tests.gid(27))->'active', 'null'::jsonb, 'G52 a fine ended before its start is not the active fine of the state either');
reset role;

-- ===================================================== H. rejecting photos
select tests.as(10);
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(83, 1), 'Foto borrosa') $$, 'P0001', 'group_not_found', 'H1 an outsider gets group_not_found');
select tests.as(84);
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(83, 1), 'Foto borrosa') $$, 'P0001', 'not_group_admin', 'H2 a member who is not an admin gets not_group_admin');
select tests.as(95);
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(83, 1), 'Foto borrosa') $$, 'P0001', 'group_not_found', 'H3 an admin of another group cannot reject in this one');
select throws_ok($$ select public.reject_group_checkin(tests.gid(32), tests.c(96, 1), 'Foto borrosa') $$, 'P0001', 'no_photo_rule', 'H4 a group that does not ask for photos refuses');
select tests.as(81);
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(98, 1), 'Foto borrosa') $$, 'P0001', 'checkin_not_found', 'H5 a photo of another group is checkin_not_found');
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(83, 2), 'Foto borrosa') $$, 'P0001', 'checkin_not_found', 'H6 a photo of a habit that is not linked to the group is checkin_not_found');
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(83, 3), 'Foto borrosa') $$, 'P0001', 'checkin_not_found', 'H7 a check-in without a photo is checkin_not_found');
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(84, 2), 'Foto borrosa') $$, 'P0001', 'checkin_not_found', 'H8 a photo dated before the member joined is checkin_not_found');
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.gid(999), 'Foto borrosa') $$, 'P0001', 'checkin_not_found', 'H9 an unknown check-in is checkin_not_found');
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(81, 1), 'Foto borrosa') $$, 'P0001', 'own_checkin', 'H10 an admin cannot reject their own photo');
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(85, 1), 'Foto borrosa') $$, 'P0001', 'reject_window_closed', 'H11 after 24 hours it cannot be rejected');
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(84, 3), 'Foto borrosa') $$, 'P0001', 'week_closed', 'H12 a photo of a closed week cannot be rejected');
select throws_ok(format($$ select public.reject_group_checkin(tests.gid(31), tests.c(83, 1), %s) $$, r), 'P0001', 'invalid_reason', 'H13 invalid reason ' || left(r, 10))
  from unnest(array['''''', '''   ''', 'null', quote_literal(repeat('x', 141)), quote_literal(E'a\nb')]) r;
select is(tests.val($$ select count(*) from public.checkins where rejected_at is not null and id = tests.c(83, 1) $$), '0', 'H14 none of those refusals changed the check-in');
select public.reject_group_checkin(tests.gid(31), tests.c(83, 1), '  Foto borrosa  ');
select is(tests.val($$ select row(rejected_by, reject_reason)::text from public.checkins where id = tests.c(83, 1) $$), row(tests.u(81), 'other')::text,
  'H15 rejecting sets the existing rejected_* columns (the enum reason is "other"; the words live in the group table)');
select is(tests.val($$ select reason from public.group_checkin_rejections where checkin_id = tests.c(83, 1) $$), 'Foto borrosa', 'H16 the trimmed reason is kept apart');
select is(tests.val($$ select count(*) from public.notifications where type = 'group_photo_rejected' and payload->>'group_id' = tests.gid(31)::text $$), '1', 'H17 the owner is notified once');
select is(tests.val($$ select user_id::text from public.notifications where type = 'group_photo_rejected' and payload->>'group_id' = tests.gid(31)::text $$), tests.u(83)::text, 'H18 and only the owner');
select is(tests.val($$ select string_agg(k, ',' order by k collate "C") from (select distinct jsonb_object_keys(payload) k from public.notifications where type = 'group_photo_rejected' and payload->>'group_id' = tests.gid(31)::text) s $$),
  'group_id,group_name,local_date,reason', 'H19 with exactly group_id, group_name, local_date and reason');
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(83, 1), 'Otra vez') $$, 'P0001', 'checkin_not_found', 'H20 rejecting it again is checkin_not_found');
select tests.as(84);
select is((select count(*)::int from public.group_wall(tests.gid(31)) w where w.checkin_id = tests.c(83, 1)), 0, 'H21 a rejected photo leaves the wall');
select is((select done from public.group_board(tests.gid(31)) b where b.user_id = tests.u(83)), 0, 'H22 and does not count on the board');
-- an admin cannot reject another admin''s photo... but can: the other admin rejects 81's, and 81 cannot undo it
select tests.as(82);
select public.reject_group_checkin(tests.gid(31), tests.c(81, 1), 'No se ve el gimnasio');
select tests.as(81);
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(31), tests.c(81, 1)) $$, 'P0001', 'own_checkin', 'H23 an admin cannot undo the rejection of their own photo');
select tests.as(82);
select public.undo_group_checkin_rejection(tests.gid(31), tests.c(81, 1));
select is(tests.val($$ select count(*) from public.checkins where id = tests.c(81, 1) and rejected_at is null and rejected_by is null and reject_reason is null $$), '1',
  'H24 another admin can undo it and the check-in counts again');
select is(tests.val($$ select count(*) from public.group_checkin_rejections where checkin_id = tests.c(81, 1) $$), '0', 'H25 and the reason is gone');
-- undo rules on 84's photo: reject by 82, undo by 81 (any admin)
select public.reject_group_checkin(tests.gid(31), tests.c(84, 1), 'Repetida');
select tests.as(81);
select public.undo_group_checkin_rejection(tests.gid(31), tests.c(84, 1));
select is(tests.val($$ select count(*) from public.checkins where id = tests.c(84, 1) and rejected_at is null $$), '1', 'H26 any admin (not only the one who rejected) can undo');
select tests.as(84);
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(31), tests.c(83, 1)) $$, 'P0001', 'not_group_admin', 'H27 a member cannot undo');
select tests.as(10);
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(31), tests.c(83, 1)) $$, 'P0001', 'group_not_found', 'H28 an outsider gets group_not_found');
select tests.as(95);
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(32), tests.c(83, 1)) $$, 'P0001', 'checkin_not_found', 'H29 an admin of another group cannot undo this group''s rejection');
select tests.as(81);
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(31), tests.c(86, 1)) $$, 'P0001', 'checkin_not_found', 'H30 undoing a check-in that was never rejected is checkin_not_found');
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(31), tests.c(86, 3)) $$, 'P0001', 'checkin_not_found', 'H31 a rejection with no group record (made outside the group function) cannot be undone here');
-- closed week: a recorded group rejection inside it cannot be undone
reset role;
insert into public.group_checkin_rejections (checkin_id, group_id, rejected_by, reason) values (tests.c(86, 3), tests.gid(31), tests.u(81), 'Antigua');
select tests.as(82);
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(31), tests.c(86, 3)) $$, 'P0001', 'week_closed', 'H32 a rejection cannot be undone once its week closed');
-- a challenge rival rejects 87's photo: the group cannot touch it
select tests.as(94);
select lives_ok($$ select public.reject_checkin(tests.c(87, 1), 'unclear') $$, 'H33 the 1-on-1 challenge rejection still works as before');
select tests.as(81);
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(31), tests.c(87, 1)) $$, 'P0001', 'checkin_not_found', 'H34 an admin cannot undo a challenge rejection through the group function');
select throws_ok($$ select public.reject_group_checkin(tests.gid(31), tests.c(87, 1), 'Motivo') $$, 'P0001', 'checkin_not_found', 'H35 nor rejects it again');
select is(tests.val($$ select reject_reason from public.checkins where id = tests.c(87, 1) $$), 'unclear', 'H36 and the challenge reason is untouched');
select is(tests.val($$ select count(*) from public.group_checkin_rejections where checkin_id = tests.c(87, 1) $$), '0', 'H37 the challenge rejection left no group record');
-- the list of rejected photos
select tests.as(82);
select public.reject_group_checkin(tests.gid(31), tests.c(86, 1), 'Foto de pantalla');
select tests.as(81);
select is((select count(*)::int from public.group_rejected_checkins(tests.gid(31))), 2, 'H38 an admin sees the rejected photos of weeks not yet closed (83 and 86, not the one in the closed week)');
select is((select array_agg(c.reason order by c.reason) from public.group_rejected_checkins(tests.gid(31)) c), array['Foto borrosa', 'Foto de pantalla'], 'H39 with their reasons');
select tests.as(83);
select is((select array_agg(c.reason) from public.group_rejected_checkins(tests.gid(31)) c), array['Foto borrosa'], 'H41 the owner sees their own rejection and its reason');
select tests.as(84);
select is((select count(*)::int from public.group_rejected_checkins(tests.gid(31))), 0, 'H42 another member sees nothing, so never a reason');
select tests.as(10);
select throws_ok($$ select * from public.group_rejected_checkins(tests.gid(31)) $$, 'P0001', 'group_not_found', 'H43 an outsider gets group_not_found');
select tests.as(81);
select is((select c.rejected_by_name from public.group_rejected_checkins(tests.gid(31)) c where c.checkin_id = tests.c(83, 1)), (select display_name from public.profiles where id = tests.u(81)), 'H44 the list names who rejected');
reset role;
select is((select count(*)::int from public.notifications where type = 'group_photo_rejected' and payload->>'group_id' = tests.gid(31)::text and user_id not in (tests.u(83), tests.u(81), tests.u(84), tests.u(86))), 0, 'H45 only owners were notified');
select is((select count(*)::int from public.notifications where payload->>'group_id' = tests.gid(31)::text and payload::text like '%Foto borrosa%' and user_id <> tests.u(83)), 0, 'H46 a reason reaches no one but the photo''s owner');


-- ===================================================== H2. admins read a rejected photo while it can still be undone (storage policy)
select tests.as(82);
select is((select count(*)::int from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()
  and ((classid::bigint << 32) | objid::bigint) = hashtextextended('group_close:' || tests.gid(31)::text, 0)), 1,
  'H47 rejecting a photo holds the per-group lock the closing function tries (so they exclude each other)');
reset role;
insert into storage.objects (bucket_id, name, owner)
select 'proofs', tests.u(u)::text || '/' || tests.c(u, k)::text || '.jpg', null from (values (83, 1), (87, 1), (84, 1), (86, 3), (86, 1), (81, 1)) v(u, k);
create function tests.po(u int, k int) returns text language sql immutable as $f$ select tests.u(u)::text || '/' || tests.c(u, k)::text || '.jpg' $f$;
grant execute on function tests.po(int, int) to authenticated, anon, service_role;
-- 83/1 and 86/1: rejected through the group, open week, owner a live member. 87/1: rejected by a challenge rival. 86/3: group rejection in a
-- closed week. 84/1 and 81/1: rejected then undone (plain photos again).
select tests.as(81);
select is((select array_agg(name order by name) from storage.objects where bucket_id = 'proofs'
    and name = any (array[tests.po(83, 1), tests.po(87, 1), tests.po(84, 1), tests.po(86, 3), tests.po(86, 1), tests.po(81, 1)])),
  (select array_agg(n order by n) from unnest(array[tests.po(83, 1), tests.po(86, 1), tests.po(84, 1), tests.po(81, 1)]) n),
  'H48 an admin reads the photos rejected through the group (open week) and the plain ones, not the challenge-rejected one, not the closed week''s');
select tests.as(82);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.po(83, 1)), 1, 'H49 so does the other admin');
select tests.as(84);
select is((select array_agg(name order by name) from storage.objects where bucket_id = 'proofs'
    and name = any (array[tests.po(83, 1), tests.po(87, 1), tests.po(84, 1), tests.po(86, 3), tests.po(86, 1), tests.po(81, 1)])),
  (select array_agg(n order by n) from unnest(array[tests.po(84, 1), tests.po(81, 1)]) n),
  'H50 a plain member reads no rejected photo (only the undone ones, which count again)');
select tests.as(95);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs'
    and name = any (array[tests.po(83, 1), tests.po(86, 1), tests.po(84, 1), tests.po(81, 1)])), 0, 'H51 an admin of another group reads none');
select tests.as(83);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.po(83, 1)), 1, 'H52 the owner branch is unchanged: the owner reads their rejected photo');
reset role;
-- a linked habit made private by a privileged write (the client guard does not apply to it) opens nothing through the admin branch
update public.habits set visibility = 'private' where id = tests.h(83, 6);
select tests.as(81);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.po(83, 1)), 0, 'H52b a photo of a habit that became private is not opened to the admin');
reset role;
update public.habits set visibility = 'friends' where id = tests.h(83, 6);
-- the week closes: the window ends
insert into public.group_weeks (group_id, week_start, closed_at, commitment_name, target_per_week, requires_photo, members_counted, members_complied)
values (tests.gid(31), tests.wk(), now(), 'Gym', 2, true, 0, 0);
select tests.as(81);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = any (array[tests.po(83, 1), tests.po(86, 1)])), 0,
  'H53 once the week of the photo is closed the admin no longer reads it');
reset role;
delete from public.group_weeks where group_id = tests.gid(31) and week_start = tests.wk();
-- the owner leaves
update public.group_members set left_at = now(), left_reason = 'left', is_live = false where group_id = tests.gid(31) and user_id = tests.u(83);
select tests.as(81);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.po(83, 1)), 0, 'H54 after the owner left the group the admin no longer reads it');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.po(86, 1)), 1, 'H55 while the one of a member who stayed is still readable');
select throws_ok($$ select public.undo_group_checkin_rejection(tests.gid(31), tests.c(83, 1)) $$, 'P0001', 'checkin_not_found', 'H56 and the rejection of someone who left cannot be undone');
select is((select count(*)::int from public.group_rejected_checkins(tests.gid(31)) c where c.checkin_id = tests.c(83, 1)), 0, 'H57 nor listed');
reset role;
select is(tests.val($$ select count(*) from public.checkins where id = tests.c(83, 1) and rejected_at is not null $$), '1', 'H58 and the check-in of the person who left is untouched');
update public.groups set archived_at = now() where id = tests.gid(31);
select tests.as(81);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.po(86, 1)), 0, 'H59 an archived group opens no rejected photo');
reset role;

-- ===================================================== I. the trigger on membership and account deletion are covered in K
-- ===================================================== J. closing weeks with a fine (fixed dates)
-- isolate: every group made so far is archived, only the closing fixtures are due
update public.groups set archived_at = coalesce(archived_at, now());
-- GC: created Sunday 2026-11-01, target 2. users 101..107. Weeks closed by 2026-11-24: 10-26 (no fine), 11-02 and 11-09 (fine A, 500), 11-16 (fine B, 1500)
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at) values
  (tests.gid(41), 'Cierre multa', 'barbell', 'salvia', 'Gym', 'barbell', 2, false, 'America/Santiago', tests.u(101), timestamptz '2026-11-01 10:00 America/Santiago');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from, left_at, left_reason, is_live) values
  (tests.gid(41), tests.u(101), 'admin', tests.h(101, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', null, null, true),
  (tests.gid(41), tests.u(102), 'member', tests.h(102, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', null, null, true),
  (tests.gid(41), tests.u(103), 'member', tests.h(103, 1), timestamptz '2026-11-04 12:00 America/Santiago', date '2026-11-04', date '2026-11-09', null, null, true),
  (tests.gid(41), tests.u(104), 'member', tests.h(104, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', timestamptz '2026-11-12 09:00 America/Santiago', 'left', false),
  (tests.gid(41), tests.u(105), 'member', tests.h(105, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', timestamptz '2026-11-05 09:00 America/Santiago', 'removed', false),
  (tests.gid(41), tests.u(106), 'member', tests.h(106, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', null, null, true),
  (tests.gid(41), tests.u(107), 'member', tests.h(107, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', timestamptz '2026-11-18 09:00 America/Santiago', 'left', false);
insert into public.group_fines (id, group_id, amount, purpose, proposed_by, proposed_at, expires_at, eligible_count, status, starts_on, ends_on, decided_at) values
  (tests.gid(141), tests.gid(41), 500, 'Primera', tests.u(101), timestamptz '2026-10-20 10:00 America/Santiago', timestamptz '2026-10-27 10:00 America/Santiago', 7, 'superseded', date '2026-11-02', date '2026-11-16', timestamptz '2026-10-21 10:00 America/Santiago'),
  (tests.gid(142), tests.gid(41), 1500, 'Segunda', tests.u(101), timestamptz '2026-11-05 10:00 America/Santiago', timestamptz '2026-11-12 10:00 America/Santiago', 6, 'active', date '2026-11-16', null, timestamptz '2026-11-06 10:00 America/Santiago');
insert into public.group_fine_members (group_id, fine_id, user_id, bound_from, bound_until) values
  (tests.gid(41), tests.gid(141), tests.u(101), date '2026-11-02', date '2026-11-16'),
  (tests.gid(41), tests.gid(141), tests.u(102), date '2026-11-02', date '2026-11-16'),
  (tests.gid(41), tests.gid(141), tests.u(103), date '2026-11-09', date '2026-11-16'),
  (tests.gid(41), tests.gid(141), tests.u(104), date '2026-11-02', date '2026-11-16'),
  (tests.gid(41), tests.gid(141), tests.u(105), date '2026-11-02', date '2026-11-16'),
  (tests.gid(41), tests.gid(141), tests.u(107), date '2026-11-02', date '2026-11-16'),
  (tests.gid(41), tests.gid(142), tests.u(101), date '2026-11-16', null),
  (tests.gid(41), tests.gid(142), tests.u(103), date '2026-11-16', null),
  (tests.gid(41), tests.gid(142), tests.u(106), date '2026-11-23', null),
  (tests.gid(41), tests.gid(142), tests.u(107), date '2026-11-16', date '2026-11-23');
-- check-ins (done per week; target 2). 11-02: 101 x2 (ok), 102 x1 (fail), 104 x0 (fail), 106 x1 (fail, not bound), 107 x2 (ok)
-- 11-09: 101 x2, 102 x1 (fail), 103 x0 (fail), 104 x1 (leaver, fail), 106 x0 (not bound), 107 x2
-- 11-16: 101 x1 (fail, bound B), 102 x0 (fail, not bound B), 103 x2 (ok), 106 x0 (accepted from 11-23: not bound this week), 107 x0 (left 11-18, bound B until 11-23)
insert into public.checkins (habit_id, user_id, local_date)
select tests.h(u, 1), tests.u(u), d::date from (values
  (101, '2026-11-02'), (101, '2026-11-03'), (102, '2026-11-02'), (106, '2026-11-03'), (107, '2026-11-02'), (107, '2026-11-03'),
  (101, '2026-11-09'), (101, '2026-11-10'), (102, '2026-11-09'), (104, '2026-11-09'), (107, '2026-11-09'), (107, '2026-11-10'),
  (101, '2026-11-16'), (103, '2026-11-16'), (103, '2026-11-17')) v(u, d);
-- expiry inside the closing run: GE has one stale and one still-open proposal in two groups
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at) values
  (tests.gid(42), 'Vence', 'barbell', 'salvia', 'Gym', 'barbell', 2, false, 'America/Santiago', tests.u(111), timestamptz '2026-11-23 10:00 America/Santiago'),
  (tests.gid(44), 'Sigue abierta', 'barbell', 'salvia', 'Gym', 'barbell', 2, false, 'America/Santiago', tests.u(113), timestamptz '2026-11-23 10:00 America/Santiago');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from) values
  (tests.gid(42), tests.u(111), 'admin', tests.h(111, 1), timestamptz '2026-11-23 10:00 America/Santiago', date '2026-11-23', date '2026-11-23'),
  (tests.gid(42), tests.u(112), 'member', tests.h(112, 1), timestamptz '2026-11-23 10:00 America/Santiago', date '2026-11-23', date '2026-11-23'),
  (tests.gid(44), tests.u(113), 'admin', tests.h(113, 1), timestamptz '2026-11-23 10:00 America/Santiago', date '2026-11-23', date '2026-11-23'),
  (tests.gid(44), tests.u(114), 'member', tests.h(114, 1), timestamptz '2026-11-23 10:00 America/Santiago', date '2026-11-23', date '2026-11-23');
insert into public.group_fines (id, group_id, amount, purpose, proposed_by, proposed_at, expires_at, eligible_count, status) values
  (tests.gid(143), tests.gid(42), 700, 'Vencida', tests.u(111), timestamptz '2026-11-16 10:00 America/Santiago', timestamptz '2026-11-23 10:00 America/Santiago', 2, 'proposed'),
  (tests.gid(144), tests.gid(44), 800, 'Abierta', tests.u(113), timestamptz '2026-11-20 10:00 America/Santiago', timestamptz '2026-11-27 10:00 America/Santiago', 2, 'proposed');
insert into public.group_fine_votes (fine_id, user_id, accepted, voted_at) values
  (tests.gid(143), tests.u(111), true, timestamptz '2026-11-16 10:00 America/Santiago'), (tests.gid(144), tests.u(113), true, timestamptz '2026-11-20 10:00 America/Santiago');
delete from public.notifications where type in ('group_fund_debt', 'group_fine_expired', 'group_week_closed');
set local role service_role;
insert into t_n select 'run1', public.close_due_group_weeks(timestamptz '2026-11-24 12:00 America/Santiago');
reset role;
select is((select array_agg(week_start order by week_start) from public.group_weeks where group_id = tests.gid(41)),
  array[date '2026-10-26', date '2026-11-02', date '2026-11-09', date '2026-11-16'], 'J1 the four ended weeks are closed');
select is((select array_agg(coalesce(fine_amount, 0) order by week_start) from public.group_weeks where group_id = tests.gid(41)), array[0, 500, 500, 1500],
  'J2 each closed week snapshots the amount of the fine in force that week (a superseded fine''s amount does not leak into later weeks)');
select is((select array_agg(fine_id order by week_start) from public.group_weeks where group_id = tests.gid(41)), array[null, tests.gid(141), tests.gid(141), tests.gid(142)]::uuid[],
  'J3 and which fine it was');
select is((select count(*)::int from public.group_fund_debts where group_id = tests.gid(41)), 8, 'J4 eight debts, including a removed member who was still bound');
select is((select array_agg(debtor_id::text || '/' || amount order by debtor_id) from public.group_fund_debts where group_id = tests.gid(41) and week_start = date '2026-11-02'),
  array[tests.u(102)::text || '/500', tests.u(104)::text || '/500', tests.u(105)::text || '/500'], 'J5 week 11-02 includes removed member 105, who was bound and failed');
select is((select array_agg(debtor_id::text || '/' || amount order by debtor_id) from public.group_fund_debts where group_id = tests.gid(41) and week_start = date '2026-11-09'),
  array[tests.u(102)::text || '/500', tests.u(103)::text || '/500', tests.u(104)::text || '/500'],
  'J6 week 11-09: 103 joined on a Wednesday, counts from this Monday and is bound for the whole week; 104 left on the 12th but is still evaluated');
select is((select array_agg(debtor_id::text || '/' || amount order by debtor_id) from public.group_fund_debts where group_id = tests.gid(41) and week_start = date '2026-11-16'),
  array[tests.u(101)::text || '/1500', tests.u(107)::text || '/1500'],
  'J7 week 11-16: the new amount; 102 did not accept it; 106 accepts from 11-23 so is bound only part of that week; 107 left on the 18th but is bound until 11-23');
select is((select count(*)::int from public.group_fund_debts where group_id = tests.gid(41) and debtor_id = tests.u(105)), 1, 'J8 a member removed by an admin still owes the fine they accepted');
select is((select count(*)::int from public.group_fund_debts where group_id = tests.gid(41) and debtor_id = tests.u(106)), 0, 'J9 someone not bound for the whole week has no debt');
select is((select count(*)::int from public.group_fund_debts where group_id = tests.gid(41) and week_start = date '2026-10-26'), 0, 'J10 a week before any fine began creates no debt');
select is((select counted from public.group_week_results where group_id = tests.gid(41) and week_start = date '2026-11-09' and user_id = tests.u(104)), false,
  'J11 the leaver''s row is uncounted (0023 behaviour) and it is the row the debt came from');
select is((select row(members_counted, members_complied)::text from public.group_weeks where group_id = tests.gid(41) and week_start = date '2026-11-09'),
  row(5, 2)::text, 'J12 the leaver stays out of the week''s counts, as in 0023');
select is((select count(*)::int from public.notifications where type = 'group_fund_debt'), 8, 'J14 one notification per debt');
select is((select string_agg(k, ',' order by k collate "C") from (select distinct jsonb_object_keys(payload) k from public.notifications where type = 'group_fund_debt') s),
  'amount,group_id,group_name,week_start', 'J15 with exactly group_id, group_name, week_start and amount');
select is((select count(*)::int from public.notifications where type = 'group_fund_debt' and user_id = tests.u(105)), 1, 'J16 the removed debtor is told about their debt');
select is((select status from public.group_fines where id = tests.gid(143)), 'expired', 'J17 the closing run expired the stale proposal');
select is((select status from public.group_fines where id = tests.gid(144)), 'proposed', 'J18 and left the one that is still open');
select is((select count(*)::int from public.notifications where type = 'group_fine_expired' and payload->>'group_id' = tests.gid(42)::text), 2, 'J19 the expiry told both members once');
select is((select count(*)::int from public.notifications where type = 'group_fine_expired' and payload->>'group_id' = tests.gid(44)::text), 0, 'J20 and nothing was sent for the open one');
-- idempotent re-run
insert into t_snap select 'debts', md5(string_agg(row(d.*)::text, '|' order by d.group_id, d.week_start, d.debtor_id)) from public.group_fund_debts d where d.group_id = tests.gid(41);
insert into t_snap select 'weeks', md5(string_agg(row(w.*)::text, '|' order by w.group_id, w.week_start)) from public.group_weeks w where w.group_id = tests.gid(41);
set local role service_role;
insert into t_n select 'run2', public.close_due_group_weeks(timestamptz '2026-11-24 12:00 America/Santiago');
reset role;
select is((select n from t_n where k = 'run2'), 0, 'J21 a second run closes nothing');
select is((select md5(string_agg(row(d.*)::text, '|' order by d.group_id, d.week_start, d.debtor_id)) from public.group_fund_debts d where d.group_id = tests.gid(41)), (select v from t_snap where k = 'debts'), 'J22 and changes no debt');
select is((select md5(string_agg(row(w.*)::text, '|' order by w.group_id, w.week_start)) from public.group_weeks w where w.group_id = tests.gid(41)), (select v from t_snap where k = 'weeks'), 'J23 nor any week');
select is((select count(*)::int from public.notifications where type = 'group_fund_debt'), 8, 'J24 nor sends a notification again');
select is((select count(*)::int from public.notifications where type = 'group_fine_expired' and payload->>'group_id' = tests.gid(42)::text), 2, 'J25 nor expires again');
-- the second of two concurrent runs, as it behaves once the first has committed: the week function called again for a closed week
select lives_ok($$ select public.groups_close_week(tests.gid(41), date '2026-11-09', now()) $$, 'J26 closing an already closed week again is harmless');
select is((select count(*)::int from public.group_fund_debts where group_id = tests.gid(41)), 8, 'J27 and creates no second debt');
select is((select count(*)::int from public.notifications where type = 'group_fund_debt'), 8, 'J28 nor a second notification');
select throws_ok($$ insert into public.group_fund_debts (group_id, fine_id, week_start, debtor_id, amount) values (tests.gid(41), tests.gid(142), date '2026-11-16', tests.u(101), 1500) $$,
  '23505', null, 'J29 and even a racing writer is stopped by the unique key');
-- the group totals of that fund
select tests.as(102);
select is(public.group_fund(tests.gid(41))->'totals', '{"registered": 6000, "paid": 0, "pending": 6000}'::jsonb, 'J30 the fund totals include the removed member''s debt');
reset role;

-- M5: each result row says who the fine bound that week; a later change of the bindings never alters a closed week
select is((select array_agg(user_id order by user_id) from public.group_week_results where group_id = tests.gid(41) and week_start = date '2026-11-09' and bound),
  array[tests.u(101), tests.u(102), tests.u(103), tests.u(104), tests.u(107)], 'J33 the closed week records who was bound (106 failed but was not)');
select is((select count(*)::int from public.group_week_results where group_id = tests.gid(41) and week_start = date '2026-10-26' and bound), 0, 'J34 a week before the fine has nobody bound');
insert into t_snap select 'rows', md5(string_agg(row(r.*)::text, '|' order by r.week_start, r.user_id)) from public.group_week_results r where r.group_id = tests.gid(41);
insert into public.group_fine_members (group_id, fine_id, user_id, bound_from, bound_until) values (tests.gid(41), tests.gid(141), tests.u(106), date '2026-11-02', date '2026-11-16');
update public.group_fine_members set bound_until = date '2026-11-09' where fine_id = tests.gid(141) and user_id = tests.u(102);
delete from public.group_fine_members where fine_id = tests.gid(142) and user_id = tests.u(101);
select lives_ok($$ select public.groups_close_week(tests.gid(41), date '2026-11-09', now()) $$, 'J35 closing a closed week again after the bindings changed');
select is((select md5(string_agg(row(r.*)::text, '|' order by r.week_start, r.user_id)) from public.group_week_results r where r.group_id = tests.gid(41)), (select v from t_snap where k = 'rows'),
  'J36 changes no result row, so a later binding change cannot rewrite a closed week');
select is((select count(*)::int from public.group_fund_debts where group_id = tests.gid(41)), 8, 'J37 nor its debts');

-- deleting an account ends its binding and keeps its debts
update public.profiles set deleted_at = now() where id = tests.u(103);
select is((select count(*)::int from public.group_fund_debts where debtor_id = tests.u(103)), 1, 'J31 a deleted account keeps its recorded debt');
select is((select bound_until from public.group_fine_members where fine_id = tests.gid(142) and user_id = tests.u(103)), tests.nm(), 'J32 and its binding ends from the next Monday');


-- ===================================================== J2. leaving and coming back inside one week (I2)
-- Gr: created Sunday 2026-11-01, target 2, fine 1500 from 11-02. 151 admin. 152 leaves Tuesday 09:00 and is back at 10:00 (3 real check-ins).
-- 153 leaves Tuesday, is back Wednesday and is removed Thursday. 154 leaves and comes back the same day with 1 check-in.
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at) values
  (tests.gid(45), 'Vuelven', 'barbell', 'salvia', 'Gym', 'barbell', 2, false, 'America/Santiago', tests.u(151), timestamptz '2026-11-01 10:00 America/Santiago');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from, left_at, left_reason, is_live) values
  (tests.gid(45), tests.u(151), 'admin', tests.h(151, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', null, null, true),
  (tests.gid(45), tests.u(152), 'member', tests.h(152, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', timestamptz '2026-11-03 09:00 America/Santiago', 'left', false),
  (tests.gid(45), tests.u(152), 'member', tests.h(152, 1), timestamptz '2026-11-03 10:00 America/Santiago', date '2026-11-03', date '2026-11-09', null, null, true),
  (tests.gid(45), tests.u(153), 'member', tests.h(153, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', timestamptz '2026-11-03 09:00 America/Santiago', 'left', false),
  (tests.gid(45), tests.u(153), 'member', tests.h(153, 1), timestamptz '2026-11-04 10:00 America/Santiago', date '2026-11-04', date '2026-11-09', timestamptz '2026-11-05 09:00 America/Santiago', 'removed', false),
  (tests.gid(45), tests.u(154), 'member', tests.h(154, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', timestamptz '2026-11-03 09:00 America/Santiago', 'left', false),
  (tests.gid(45), tests.u(154), 'member', tests.h(154, 1), timestamptz '2026-11-03 10:00 America/Santiago', date '2026-11-03', date '2026-11-09', null, null, true),
  -- 155: removed Tuesday, invited again Wednesday and still active
  (tests.gid(45), tests.u(155), 'member', tests.h(155, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', timestamptz '2026-11-03 09:00 America/Santiago', 'removed', false),
  (tests.gid(45), tests.u(155), 'member', tests.h(155, 1), timestamptz '2026-11-04 10:00 America/Santiago', date '2026-11-04', date '2026-11-09', null, null, true),
  -- 156: three memberships with three habits inside ONE day. 157: two habits, two real days
  (tests.gid(45), tests.u(156), 'member', tests.h(156, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', timestamptz '2026-11-03 09:00 America/Santiago', 'left', false),
  (tests.gid(45), tests.u(156), 'member', tests.h(156, 2), timestamptz '2026-11-03 10:00 America/Santiago', date '2026-11-03', date '2026-11-09', timestamptz '2026-11-03 11:00 America/Santiago', 'left', false),
  (tests.gid(45), tests.u(156), 'member', tests.h(156, 3), timestamptz '2026-11-03 12:00 America/Santiago', date '2026-11-03', date '2026-11-09', null, null, true),
  (tests.gid(45), tests.u(157), 'member', tests.h(157, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', timestamptz '2026-11-03 09:00 America/Santiago', 'left', false),
  (tests.gid(45), tests.u(157), 'member', tests.h(157, 2), timestamptz '2026-11-03 10:00 America/Santiago', date '2026-11-03', date '2026-11-09', null, null, true);
insert into public.group_fines (id, group_id, amount, purpose, proposed_by, proposed_at, expires_at, eligible_count, status, starts_on, decided_at) values
  (tests.gid(146), tests.gid(45), 1500, 'Vuelven', tests.u(151), timestamptz '2026-10-20 10:00 America/Santiago', timestamptz '2026-10-27 10:00 America/Santiago', 4, 'active', date '2026-11-02', timestamptz '2026-10-21 10:00 America/Santiago');
insert into public.group_fine_members (group_id, fine_id, user_id, bound_from) select tests.gid(45), tests.gid(146), tests.u(u), date '2026-11-02' from unnest(array[151, 152, 153, 154, 155, 156, 157]) u;
insert into public.checkins (habit_id, user_id, local_date)
select tests.h(u, 1), tests.u(u), d::date from (values (151, '2026-11-02'), (151, '2026-11-03'), (152, '2026-11-02'), (152, '2026-11-04'), (152, '2026-11-05'),
  (153, '2026-11-02'), (153, '2026-11-04'), (154, '2026-11-02')) v(u, d);
insert into public.checkins (habit_id, user_id, local_date) values
  (tests.h(156, 1), tests.u(156), date '2026-11-03'), (tests.h(156, 2), tests.u(156), date '2026-11-03'), (tests.h(156, 3), tests.u(156), date '2026-11-03'),
  (tests.h(157, 1), tests.u(157), date '2026-11-02'), (tests.h(157, 1), tests.u(157), date '2026-11-03'), (tests.h(157, 2), tests.u(157), date '2026-11-03');
set local role service_role;
insert into t_n select 'run4', public.close_due_group_weeks(timestamptz '2026-11-10 12:00 America/Santiago');
reset role;
select is((select array_agg(user_id order by user_id) from public.group_week_results where group_id = tests.gid(45) and week_start = date '2026-11-02'),
  array[tests.u(151), tests.u(152), tests.u(153), tests.u(154), tests.u(155), tests.u(156), tests.u(157)],
  'J38 removed members retain an uncounted row for evaluating any fine they accepted');
select is((select row(done, complied, counted)::text from public.group_week_results where group_id = tests.gid(45) and week_start = date '2026-11-02' and user_id = tests.u(152)),
  row(3, true, false)::text, 'J39 who left and came back the same week is evaluated on all their check-ins, before and after');
select is((select array_agg(debtor_id::text || '/' || amount order by debtor_id) from public.group_fund_debts where group_id = tests.gid(45)),
  array[tests.u(154)::text || '/1500', tests.u(155)::text || '/1500', tests.u(156)::text || '/1500'],
  'J40 removed member 155 still owes, while 153 complied and 152 came back and complied');
select is((select row(done, complied)::text from public.group_week_results where group_id = tests.gid(45) and week_start = date '2026-11-02' and user_id = tests.u(156)),
  row(1, false)::text, 'J41 three habits on ONE day are one day, so a bound member cannot reach the target by leaving and coming back with other habits');
select is((select row(done, complied)::text from public.group_week_results where group_id = tests.gid(45) and week_start = date '2026-11-02' and user_id = tests.u(157)),
  row(2, true)::text, 'J42 while two real days with two habits still count as two');
select is((select count(*)::int from public.group_fund_debts where group_id = tests.gid(45) and debtor_id = tests.u(155)), 1, 'J43 removal and reinvitation cannot evade the weekly fine');

-- ===================================================== K. a rejected photo counts nowhere, an undone one counts again (real week)
-- GPR: photo group, target 1, created last week. fine of 800 active from this Monday. 131 and 132 admins, 133 and 134 members.
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at) values
  (tests.gid(43), 'Foto multa', 'camera', 'salvia', 'Foto', 'camera', 1, true, 'America/Santiago', tests.u(131), ((tests.wk() - 7)::timestamp + interval '10 hours') at time zone 'America/Santiago');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from) values
  (tests.gid(43), tests.u(131), 'admin', tests.h(131, 6), ((tests.wk() - 7)::timestamp + interval '10 hours') at time zone 'America/Santiago', tests.wk() - 7, tests.wk() - 7),
  (tests.gid(43), tests.u(132), 'admin', tests.h(132, 6), ((tests.wk() - 7)::timestamp + interval '10 hours') at time zone 'America/Santiago', tests.wk() - 7, tests.wk() - 7),
  (tests.gid(43), tests.u(133), 'member', tests.h(133, 6), ((tests.wk() - 7)::timestamp + interval '10 hours') at time zone 'America/Santiago', tests.wk() - 7, tests.wk() - 7),
  (tests.gid(43), tests.u(134), 'member', tests.h(134, 6), ((tests.wk() - 7)::timestamp + interval '10 hours') at time zone 'America/Santiago', tests.wk() - 7, tests.wk() - 7);
insert into public.group_fines (id, group_id, amount, purpose, proposed_by, proposed_at, expires_at, eligible_count, status, starts_on, decided_at) values
  (tests.gid(145), tests.gid(43), 800, 'Fotos', tests.u(131), now() - interval '10 days', now() - interval '3 days', 4, 'active', tests.wk(), now() - interval '9 days');
insert into public.group_fine_members (group_id, fine_id, user_id, bound_from) select tests.gid(43), tests.gid(145), tests.u(u), tests.wk() from unnest(array[131, 132, 133, 134]) u;
select tests.shot(133, 1, interval '1 hour', tests.today());
select tests.shot(134, 1, interval '1 hour', tests.today());
select tests.shot(131, 1, interval '1 hour', tests.today());
select tests.shot(132, 1, interval '1 hour', tests.today());
select tests.as(131);
select public.reject_group_checkin(tests.gid(43), tests.c(133, 1), 'Foto ajena');
select public.reject_group_checkin(tests.gid(43), tests.c(134, 1), 'Dudosa');
select tests.as(132);
select public.undo_group_checkin_rejection(tests.gid(43), tests.c(134, 1));
reset role;
set local role service_role;
-- the week of the photos ends on tests.wk() + 7; a moment two days after it every photo is older than 24 hours
insert into t_n select 'run3', public.close_due_group_weeks(((tests.wk() + 9)::timestamp + interval '12 hours') at time zone 'America/Santiago');
reset role;
select is((select array_agg(debtor_id::text || '/' || amount order by debtor_id) from public.group_fund_debts where group_id = tests.gid(43)),
  array[tests.u(133)::text || '/800'], 'K1 the rejected photo does not count, so its owner owes; the undone one counts, so its owner does not');
select is((select array_agg(week_start order by week_start) from public.group_weeks where group_id = tests.gid(43)), array[tests.wk() - 7, tests.wk()], 'K2 both weeks closed');
select is((select fine_amount from public.group_weeks where group_id = tests.gid(43) and week_start = tests.wk() - 7), null, 'K3 the week before the fine began carries no fine');

-- ===================================================== L. a lasting guard: the new RPCs never touch 0023 tables directly
select tests.as(1);
reset role;

select * from finish();
rollback;
