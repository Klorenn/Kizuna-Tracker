begin;
-- Groups (0023): tables, RPCs, limits, reads, the proofs branch, habit guards, weekly closing, deletion.
-- Own fixtures. Everything is rolled back; the file never touches rows it did not create.
create extension if not exists pgtap with schema extensions;
select plan(348);

create schema tests;
-- ids: users e3600000-...-0000000000NN, habits b3600000-...-<user 4 digits>-<k>, check-ins c3600000-...
create function tests.u(n int) returns uuid language sql immutable as $f$
  select ('e3600000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $f$;
create function tests.h(u int, k int) returns uuid language sql immutable as $f$
  select ('b3600000-0000-0000-' || lpad(u::text, 4, '0') || '-' || lpad(k::text, 12, '0'))::uuid $f$;
create function tests.c(u int, k int) returns uuid language sql immutable as $f$
  select ('c3600000-0000-0000-' || lpad(u::text, 4, '0') || '-' || lpad(k::text, 12, '0'))::uuid $f$;
create function tests.today() returns date language sql stable as $f$
  select (now() at time zone 'America/Santiago')::date $f$;
create function tests.nm() returns date language sql stable as $f$
  select tests.today() + (8 - extract(isodow from tests.today())::int) $f$;
create function tests.wk() returns date language sql stable as $f$
  select date_trunc('week', now() at time zone 'America/Santiago')::date $f$;
create function tests.login(n int) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', tests.u(n), 'role', 'authenticated')::text, true) $f$;
create function tests.nosession() returns void language sql as $f$
  select set_config('request.jwt.claims', '{"role":"authenticated"}', true) $f$;
create table tests.ctx (k text primary key, v uuid);
create function tests.save(key text, val uuid) returns uuid language plpgsql security definer as $f$
begin insert into tests.ctx (k, v) values (key, val) on conflict (k) do update set v = excluded.v; return val; end $f$;
create function tests.g(k text) returns uuid language sql stable security definer as $f$
  select v from tests.ctx where ctx.k = $1 $f$;
create function tests.n(q text) returns int language plpgsql as $f$
declare c int;
begin
  execute 'with u as (' || q || ') select count(*)::int from u' into c;
  return c;
end $f$;
-- true when the statement is refused with insufficient_privilege for that role
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
grant usage on schema tests to authenticated, anon, service_role;
grant execute on all functions in schema tests to authenticated, anon, service_role;
grant select on tests.ctx to authenticated, anon;
create function tests.p(u int, k int) returns text language sql immutable as $f$
  select tests.u(u)::text || '/' || tests.c(u, k)::text || '.jpg' $f$;
grant execute on function tests.p(int, int) to authenticated, anon, service_role;
create temp table t_codes (k text primary key, code text);
create temp table t_cur (k text primary key, ts timestamptz, id uuid);
create temp table t_close (k text primary key, n int);
grant all on t_codes, t_cur, t_close to authenticated, anon, service_role;

-- ===================================================== fixtures (as postgres)
-- users 1..160. 01 ana (admin of G1), 02 bruno, 03 carla, 04 dani, 05 eli, 06 fran (friend of bruno), 07 gus (stranger),
-- 08 hugo (member of G2 only), 09 ines (admin of G2), 10 deleted account, 11 kai, 12 lola (removed), 13..17 board group,
-- 18/19 archive-photo group, 20 limit tester, 21..71 seat fillers, 72..75 misc, 101..160 closing and deletion groups.
insert into auth.users (id) select tests.u(g) from generate_series(1, 200) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at)
select tests.u(g), 'g36_' || lpad(g::text, 3, '0'), 'U' || g, 'Test', '1990-01-01', now(), 'America/Santiago',
       case when g = 10 then now() end
from generate_series(1, 200) g;
-- habits k: 3 private, 4 archived, 5 quantity, 6 asks for a photo, everything else a normal shared habit
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility, archived_at)
select tests.h(u, k), tests.u(u), 'H' || u || '-' || k, 'barbell', 'daily', k = 6,
       case when k = 3 then 'private' else 'friends' end, case when k = 4 then now() end
from generate_series(1, 200) u, generate_series(1, 20) k where k <> 5;
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, log_type, quantity_unit, quantity_target, quantity_step)
select tests.h(u, 5), tests.u(u), 'Q' || u, 'drop', 'daily', 'friends', 'quantity', 'times', 4, 1
from generate_series(1, 200) u;
insert into public.friendships (requester_id, addressee_id, status) values (tests.u(6), tests.u(2), 'accepted');
-- bruno's habit 7 and gus's habit 7 are in an active 1-on-1 challenge
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on)
values ('d3600000-0000-0000-0000-0000000000c1', tests.u(2), tests.u(7), tests.h(2, 7), tests.h(7, 7), 'daily', null, false, 4, 1000,
        'America/Santiago', 'active', tests.today());
-- the unrelated challenge period used to prove the challenge behaviour of habit_date_period_closed is unchanged
insert into public.habits (id, user_id, name, icon, frequency_type, visibility) values
  (tests.h(2, 30), tests.u(2), 'Reto cerrado', 'barbell', 'daily', 'friends'),
  (tests.h(7, 30), tests.u(7), 'Reto cerrado rival', 'barbell', 'daily', 'friends');
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on)
values ('d3600000-0000-0000-0000-0000000000c2', tests.u(2), tests.u(7), tests.h(2, 30), tests.h(7, 30), 'daily', null, false, 4, 1000,
        'America/Santiago', 'active', tests.today() - 30);
insert into public.challenge_periods (challenge_id, period_start, period_end, closed_at) values
  ('d3600000-0000-0000-0000-0000000000c2', tests.today() - 30, tests.today() - 24, now()),
  ('d3600000-0000-0000-0000-0000000000c2', tests.today() - 23, tests.today() - 17, null);
insert into public.checkins (habit_id, user_id, local_date) values
  (tests.h(2, 30), tests.u(2), tests.today() - 28),
  (tests.h(2, 30), tests.u(2), tests.today() - 20);

-- ===================================================== A. structure, grants, RLS
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity
  and relname in ('groups', 'group_members', 'group_invites', 'group_weeks', 'group_week_results')), 5,
  'A1 the five group tables exist with row level security on');
select is((select count(*)::int from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
    and table_name in ('groups', 'group_members', 'group_invites', 'group_weeks', 'group_week_results')), 0,
  'A2 no client role holds any privilege on the group tables');
select is((select count(*)::int from pg_policy where polrelid in
  ('public.groups'::regclass, 'public.group_members'::regclass, 'public.group_invites'::regclass,
   'public.group_weeks'::regclass, 'public.group_week_results'::regclass)), 0,
  'A3 the group tables have no policy at all (RLS is a second wall behind the missing grants)');
select is((select bool_and(tests.denied(r, format('select 1 from public.%I limit 1', t)))
  from unnest(array['groups', 'group_members', 'group_invites', 'group_weeks', 'group_week_results']) t, unnest(array['authenticated', 'anon']) r),
  true, 'A4 authenticated and anon cannot SELECT any group table');
select is((select bool_and(tests.denied(r, format('insert into public.%I default values', t)))
  from unnest(array['groups', 'group_members', 'group_invites', 'group_weeks', 'group_week_results']) t, unnest(array['authenticated', 'anon']) r),
  true, 'A5 authenticated and anon cannot INSERT into any group table');
select is((select bool_and(tests.denied(r, format('update public.%I set %I = %I', v.t, v.c, v.c)))
  from (values ('groups', 'name'), ('group_members', 'role'), ('group_invites', 'uses'), ('group_weeks', 'closed_at'), ('group_week_results', 'done')) v(t, c),
  unnest(array['authenticated', 'anon']) r),
  true, 'A6 authenticated and anon cannot UPDATE any group table');
select is((select bool_and(tests.denied(r, format('delete from public.%I', t)))
  from unnest(array['groups', 'group_members', 'group_invites', 'group_weeks', 'group_week_results']) t, unnest(array['authenticated', 'anon']) r),
  true, 'A7 authenticated and anon cannot DELETE from any group table');
select is((select bool_and(has_function_privilege('authenticated', p, 'execute') and not has_function_privilege('anon', p, 'execute')
                           and not has_function_privilege('public', p, 'execute'))
  from unnest(array[
    'public.create_group(text,text,text,text,text,text,integer,boolean,uuid)', 'public.update_group(uuid,text,text,text,text)',
    'public.set_group_commitment(uuid,text,text,integer,boolean)', 'public.archive_group(uuid)', 'public.create_group_invite(uuid)',
    'public.join_group(text,uuid)', 'public.leave_group(uuid)', 'public.remove_group_member(uuid,uuid)',
    'public.set_group_admin(uuid,uuid,boolean)', 'public.revoke_group_invites(uuid)', 'public.my_groups()', 'public.group_detail(uuid)', 'public.group_board(uuid)',
    'public.group_wall(uuid,timestamp with time zone,uuid,integer)', 'public.group_history(uuid,integer)',
    'public.group_week_detail(uuid,date)']) p),
  true, 'A8 every client RPC is executable by authenticated only');
select ok(has_function_privilege('anon', 'public.group_invite_preview(text)', 'execute')
  and has_function_privilege('authenticated', 'public.group_invite_preview(text)', 'execute')
  and not has_function_privilege('public', 'public.group_invite_preview(text)', 'execute'),
  'A9 the invitation preview is callable by anon and authenticated');
select ok(has_function_privilege('service_role', 'public.close_due_group_weeks(timestamp with time zone)', 'execute')
  and not has_function_privilege('authenticated', 'public.close_due_group_weeks(timestamp with time zone)', 'execute')
  and not has_function_privilege('anon', 'public.close_due_group_weeks(timestamp with time zone)', 'execute')
  and not has_function_privilege('public', 'public.close_due_group_weeks(timestamp with time zone)', 'execute'),
  'A10 the closing function is service_role only');
select is((select bool_or(has_function_privilege(r, p, 'execute'))
  from unnest(array['public.groups_actor()', 'public.groups_week_start(date)', 'public.groups_counts_from(date)',
                    'public.groups_next_monday(date)', 'public.groups_streak(uuid)']) p, unnest(array['authenticated', 'anon', 'public']) r),
  false, 'A11 the internal helpers are not executable by clients');
select ok(has_function_privilege('authenticated', 'public.group_proof_readable(text)', 'execute')
  and not has_function_privilege('anon', 'public.group_proof_readable(text)', 'execute')
  and has_function_privilege('authenticated', 'public.habit_group_link(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.habit_group_link(uuid)', 'execute'),
  'A12 the two helpers a policy or an invoker trigger needs are executable by authenticated only');
select is((select count(*)::int from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and p.proname ~ '^(groups?_|my_groups|create_group|update_group|set_group|archive_group|join_group|leave_group|remove_group|revoke_group|close_due_group|habit_group_link|profiles_end_group)'
    and not coalesce(p.proconfig @> array['search_path=""'], false)), 0,
  'A13 every new SECURITY DEFINER function pins search_path to empty');
select ok((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and p.proname ~ '^(groups?_|my_groups|create_group|update_group|set_group|archive_group|join_group|leave_group|remove_group|revoke_group|close_due_group|habit_group_link|profiles_end_group)') >= 18,
  'A14 the new definer functions exist');
select is((select count(*)::int from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname ~ '^(groups?_|my_groups|create_group|update_group|set_group|archive_group|join_group|leave_group|remove_group|revoke_group|close_due_group|habit_group_link|habits_group_guard|profiles_end_group)'
    and p.prosrc ~* '\mexecute\M'), 0, 'A15 no new function uses dynamic SQL');
select has_trigger('public', 'habits', 'habits_group_guard', 'A16 habits carry the group guard');
select is((select count(*)::int from pg_trigger t where t.tgrelid in ('public.groups'::regclass, 'public.group_members'::regclass, 'public.group_invites'::regclass)
  and t.tgname like '%_forbid_deleted_actor'), 3, 'A17 the client-facing group tables join the deleted-account guard');

-- ===================================================== helpers (pure date math)
select is(public.groups_counts_from(date '2026-11-23'), date '2026-11-23', 'B1 counts_from: a Monday join counts from that same Monday');
select is(public.groups_counts_from(date '2026-11-25'), date '2026-11-30', 'B2 counts_from: a Wednesday join counts from the next Monday');
select is(public.groups_counts_from(date '2026-11-29'), date '2026-11-30', 'B3 counts_from: a Sunday join counts from the next day');
select is(public.groups_counts_from(date '2026-11-24'), date '2026-11-30', 'B4 counts_from: a Tuesday join counts from the next Monday');
select is(public.groups_next_monday(date '2026-11-23'), date '2026-11-30', 'B5 next Monday from a Monday is a week later');
select is(public.groups_next_monday(date '2026-11-29'), date '2026-11-30', 'B6 next Monday from a Sunday is the next day');
select is(public.groups_week_start(date '2026-11-29'), date '2026-11-23', 'B7 the week starts on Monday');

-- ===================================================== C. no session
set local role authenticated;
select tests.nosession();
select throws_ok(q, '28000', 'not_authenticated', 'C no session: ' || split_part(q, '(', 1)) from unnest(array[
  $$ select public.create_group('Nombre', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 2)) $$,
  $$ select public.update_group(tests.u(1), 'Nombre', 'barbell', 'salvia', null) $$,
  $$ select public.set_group_commitment(tests.u(1), 'Gym', 'barbell', 3, false) $$,
  $$ select public.archive_group(tests.u(1)) $$,
  $$ select public.create_group_invite(tests.u(1)) $$,
  $$ select public.join_group('abc', tests.h(1, 2)) $$,
  $$ select public.leave_group(tests.u(1)) $$,
  $$ select public.remove_group_member(tests.u(1), tests.u(2)) $$,
  $$ select public.set_group_admin(tests.u(1), tests.u(2), true) $$,
  $$ select public.revoke_group_invites(tests.u(1)) $$,
  $$ select * from public.my_groups() $$,
  $$ select * from public.group_detail(tests.u(1)) $$,
  $$ select * from public.group_board(tests.u(1)) $$,
  $$ select * from public.group_wall(tests.u(1)) $$,
  $$ select * from public.group_history(tests.u(1)) $$,
  $$ select * from public.group_week_detail(tests.u(1), date '2026-11-02') $$]) q;
select is(public.group_invite_preview('ZZZZZZZZ'), null, 'C16 the preview needs no session and answers null for an unknown code');

-- ===================================================== D. create_group
select tests.login(1);
select tests.save('g1', public.create_group('Gym crew', 'barbell', 'salvia', 'Vamos juntos', 'Gym 3 veces', 'barbell', 3, false, tests.h(1, 1)));
reset role;
select is((select row(name, icon, color, description, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, archived_at)::text
  from public.groups where id = tests.g('g1')),
  row('Gym crew', 'barbell', 'salvia', 'Vamos juntos', 'Gym 3 veces', 'barbell', 3, false, 'America/Santiago', tests.u(1), null)::text,
  'D1 create_group stores the group with the creator''s time zone');
select is((select row(role, habit_id, left_at, joined_on, counts_from, is_live)::text from public.group_members where group_id = tests.g('g1') and user_id = tests.u(1)),
  row('admin', tests.h(1, 1), null::timestamptz, tests.today(), public.groups_counts_from(tests.today()), true)::text,
  'D2 the creator is the first member, an admin, with the habit linked and counts_from computed');
set local role authenticated;
select tests.login(1);
select throws_ok(format($$ select public.create_group(%L, 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 2)) $$, n),
  'P0001', 'invalid_group', 'D3 invalid name: ' || length(n)) from (values ('ab'), (repeat('x', 41)), ('   '), (E'a\nb c')) v(n);
select throws_ok(q, 'P0001', 'invalid_group', 'D4 ' || d) from (values
  ($$ select public.create_group('Valido', 'barbell', 'rojo', null, 'Gym', 'barbell', 3, false, tests.h(1, 2)) $$, 'bad colour'),
  ($$ select public.create_group('Valido', 'Barbell!', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 2)) $$, 'bad icon'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', repeat('d', 141), 'Gym', 'barbell', 3, false, tests.h(1, 2)) $$, 'description over 140'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, '', 'barbell', 3, false, tests.h(1, 2)) $$, 'empty commitment name'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, repeat('c', 41), 'barbell', 3, false, tests.h(1, 2)) $$, 'commitment name over 40'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'Bad Icon', 3, false, tests.h(1, 2)) $$, 'bad commitment icon'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 0, false, tests.h(1, 2)) $$, 'target 0'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 8, false, tests.h(1, 2)) $$, 'target 8'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', null, false, tests.h(1, 2)) $$, 'null target'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, null, tests.h(1, 2)) $$, 'null photo flag'),
  ($$ select public.create_group(null, 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 2)) $$, 'null name')) v(q, d);
select throws_ok(q, 'P0001', 'habit_not_eligible', 'D5 ' || d) from (values
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(2, 2)) $$, 'someone else''s habit'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 3)) $$, 'a private habit'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 4)) $$, 'an archived habit'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 5)) $$, 'a quantity habit'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, true, tests.h(1, 2)) $$, 'no photo proof while the group requires it'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, 'b3600000-0000-0000-0000-00000000dead') $$, 'an unknown habit'),
  ($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, null) $$, 'a null habit')) v(q, d);
select throws_ok($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 1)) $$,
  'P0001', 'habit_in_group', 'D6 a habit already linked to a group cannot be linked again');
select lives_ok($$ select public.create_group('Con foto', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, true, tests.h(1, 6)) $$,
  'D7 a habit that asks for a photo can back a photo commitment');
select tests.login(7);
select lives_ok($$ select public.create_group('Reto y grupo', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(7, 7)) $$,
  'D8 a habit that is in a 1-on-1 challenge may also be linked to a group');
select tests.login(10);
select throws_ok($$ select public.create_group('Valido', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(10, 1)) $$,
  '42501', 'not_authenticated', 'D9 a deleted account cannot create a group');
-- the 10-group limit (active groups per person)
select tests.login(20);
select tests.save('l' || g, public.create_group('Limite ' || g, 'barbell', 'salvia', null, 'C', 'barbell', 1, false, tests.h(20, g + case when g >= 3 then 4 else 0 end)))
  from generate_series(1, 10) g;
select throws_ok($$ select public.create_group('Limite 11', 'barbell', 'salvia', null, 'C', 'barbell', 1, false, tests.h(20, 17)) $$,
  'P0001', 'group_limit', 'D10 the 11th active group is refused');
select public.archive_group(tests.g('l1'));
select lives_ok($$ select public.create_group('Limite 11', 'barbell', 'salvia', null, 'C', 'barbell', 1, false, tests.h(20, 17)) $$,
  'D11 an archived group no longer counts toward the limit');
select is(tests.n($$ select 1 from public.group_board(tests.g('l1')) $$), 1, 'D12 members still read an archived group');

-- ===================================================== E. update / commitment / archive (admin only)
select tests.login(8);
select throws_ok(format($$ select public.%s $$, q), 'P0001', 'group_not_found', 'E1 a non-member of the group: ' || split_part(q, '(', 1)) from unnest(array[
  $$update_group(tests.g('g1'), 'Nuevo nombre', 'barbell', 'salvia', null)$$,
  $$set_group_commitment(tests.g('g1'), 'Gym', 'barbell', 3, false)$$,
  $$archive_group(tests.g('g1'))$$,
  $$create_group_invite(tests.g('g1'))$$,
  $$leave_group(tests.g('g1'))$$,
  $$remove_group_member(tests.g('g1'), tests.u(1))$$,
  $$set_group_admin(tests.g('g1'), tests.u(1), true)$$,
  $$revoke_group_invites(tests.g('g1'))$$]) q;
select throws_ok($$ select public.update_group(null::uuid, 'Nuevo', 'barbell', 'salvia', null) $$,
  'P0001', 'group_not_found', 'E2 a null group id is group_not_found');
select throws_ok($$ select public.update_group('f3600000-0000-0000-0000-000000000001', 'Nuevo', 'barbell', 'salvia', null) $$,
  'P0001', 'group_not_found', 'E3 an unknown group id is indistinguishable from a group that exists');
reset role;
-- bruno, carla and kai are members of G1 (direct fixtures, joined ten days ago)
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from) values
  (tests.g('g1'), tests.u(2), 'member', tests.h(2, 1), now() - interval '10 days', tests.today() - 10, public.groups_counts_from(tests.today() - 10)),
  (tests.g('g1'), tests.u(3), 'member', tests.h(3, 1), now() - interval '10 days', tests.today() - 10, public.groups_counts_from(tests.today() - 10)),
  (tests.g('g1'), tests.u(11), 'member', tests.h(11, 1), now() - interval '10 days', tests.today() - 10, public.groups_counts_from(tests.today() - 10));
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from, left_at, left_reason, is_live) values
  (tests.g('g1'), tests.u(12), 'member', tests.h(12, 1), now() - interval '12 days', tests.today() - 12, public.groups_counts_from(tests.today() - 12),
   now() - interval '5 days', 'removed', false);
set local role authenticated;
select tests.login(2);
select throws_ok(format($$ select public.%s $$, q), 'P0001', 'not_group_admin', 'E4 a plain member: ' || split_part(q, '(', 1)) from unnest(array[
  $$update_group(tests.g('g1'), 'Nuevo nombre', 'barbell', 'salvia', null)$$,
  $$set_group_commitment(tests.g('g1'), 'Gym', 'barbell', 3, false)$$,
  $$archive_group(tests.g('g1'))$$,
  $$create_group_invite(tests.g('g1'))$$,
  $$remove_group_member(tests.g('g1'), tests.u(3))$$,
  $$set_group_admin(tests.g('g1'), tests.u(3), true)$$,
  $$revoke_group_invites(tests.g('g1'))$$]) q;
select tests.login(1);
select lives_ok($$ select public.update_group(tests.g('g1'), 'Gym crew 2', 'target', 'cielo', null) $$, 'E5 an admin updates the group');
select is((select row(name, icon, color, description)::text from public.group_detail(tests.g('g1'))), row('Gym crew 2', 'target', 'cielo', null::text)::text,
  'E6 the update is visible and a blank description becomes null');
select throws_ok($$ select public.update_group(tests.g('g1'), 'x', 'barbell', 'salvia', null) $$, 'P0001', 'invalid_group', 'E7 update_group validates like create_group');
select throws_ok($$ select public.set_group_commitment(tests.g('g1'), 'Gym', 'barbell', 9, false) $$, 'P0001', 'invalid_group', 'E8 set_group_commitment validates the target');
select is(public.set_group_commitment(tests.g('g1'), 'Gym 5 veces', 'target', 5, true), tests.nm(),
  'E9 a commitment change is effective next Monday in the group''s zone');
select is((select row(commitment_name, target_per_week, requires_photo, next_commitment_name, next_commitment_icon, next_target_per_week, next_requires_photo, next_effective_from)::text
  from public.group_detail(tests.g('g1'))),
  row('Gym 3 veces', 3, false, 'Gym 5 veces', 'target', 5, true, tests.nm())::text,
  'E10 the current commitment is untouched and the change is pending');
select public.set_group_commitment(tests.g('g1'), 'Gym 4 veces', 'barbell', 4, false);
select is((select row(next_commitment_name, next_target_per_week, next_requires_photo)::text from public.group_detail(tests.g('g1'))),
  row('Gym 4 veces', 4, false)::text, 'E11 a second change replaces the pending one');

-- ===================================================== F. invitations and the preview
select tests.login(1);
insert into t_codes select 'code1', public.create_group_invite(tests.g('g1'));
select matches((select code from t_codes where k = 'code1'), '^[2-9A-HJ-NP-Z]{8}$', 'F1 an invite code is 8 characters of the short alphabet');
reset role;
select is((select max_uses from public.group_invites where code = (select code from t_codes where k = 'code1')), 46,
  'F2 max_uses is the number of free seats when the invite was created (50 - 4 members)');
select is((select row(created_by, group_id, uses)::text from public.group_invites where code = (select code from t_codes where k = 'code1')),
  row(tests.u(1), tests.g('g1'), 0)::text, 'F3 the invite is recorded with its creator');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
  from public.group_invites where code = (select code from t_codes where k = 'code1')), 'F4 an invite lasts seven days');
set local role anon;
select is((select array_agg(k order by k)::text from jsonb_object_keys(public.group_invite_preview((select code from t_codes where k = 'code1'))) k),
  '{color,commitment_icon,commitment_name,full,icon,member_count,name,requires_photo,target_per_week}',
  'F5 the preview returns exactly the nine listed keys, to anon');
select is(public.group_invite_preview((select code from t_codes where k = 'code1')),
  jsonb_build_object('name', 'Gym crew 2', 'icon', 'target', 'color', 'cielo', 'commitment_name', 'Gym 3 veces', 'commitment_icon', 'barbell',
                     'target_per_week', 3, 'requires_photo', false, 'member_count', 4, 'full', false),
  'F6 the preview shows the current commitment and the active member count only');
select ok(public.group_invite_preview((select code from t_codes where k = 'code1'))::text !~* 'g36_|U[0-9]+ Test',
  'F7 the preview never contains a member name or username');
select is(public.group_invite_preview('not-a-code'), null, 'F8 a malformed code answers null');
select is(public.group_invite_preview(null), null, 'F9 a null code answers null');
select is(public.group_invite_preview('ZZZZZZZZ'), null, 'F10 an unknown code answers null');
reset role;
update public.group_invites set expires_at = now() - interval '1 minute' where code = (select code from t_codes where k = 'code1');
select is(public.group_invite_preview((select code from t_codes where k = 'code1')), null, 'F11 an expired code answers null');
update public.group_invites set expires_at = now() + interval '7 days', uses = max_uses where code = (select code from t_codes where k = 'code1');
select is(public.group_invite_preview((select code from t_codes where k = 'code1')), null, 'F12 a used-up code answers null');
update public.group_invites set uses = 0 where code = (select code from t_codes where k = 'code1');
select is((public.group_invite_preview((select code from t_codes where k = 'code1')) ->> 'member_count')::int, 4, 'F13 a valid code answers again once restored');

-- join_group
set local role authenticated;
select tests.login(4);
select throws_ok($$ select public.join_group('ZZZZZZZZ', tests.h(4, 1)) $$, 'P0001', 'invite_not_found', 'F14 an unknown code is invite_not_found');
select throws_ok($$ select public.join_group(null, tests.h(4, 1)) $$, 'P0001', 'invite_not_found', 'F15 a null code is invite_not_found');
reset role;
update public.group_invites set expires_at = now() - interval '1 minute' where code = (select code from t_codes where k = 'code1');
set local role authenticated;
select throws_ok(format($$ select public.join_group(%L, tests.h(4, 1)) $$, (select code from t_codes where k = 'code1')), 'P0001', 'invite_expired', 'F16 an expired code is invite_expired');
reset role;
update public.group_invites set expires_at = now() + interval '7 days', uses = max_uses where code = (select code from t_codes where k = 'code1');
set local role authenticated;
select throws_ok(format($$ select public.join_group(%L, tests.h(4, 1)) $$, (select code from t_codes where k = 'code1')), 'P0001', 'invite_expired', 'F17 a used-up code is invite_expired');
reset role;
update public.group_invites set uses = 0 where code = (select code from t_codes where k = 'code1');
set local role authenticated;
select tests.login(4);
select throws_ok(format($$ select public.join_group(%L, tests.h(1, 2)) $$, (select code from t_codes where k = 'code1')), 'P0001', 'habit_not_eligible', 'F18 someone else''s habit is not eligible');
select throws_ok(format($$ select public.join_group(%L, tests.h(4, %s)) $$, (select code from t_codes where k = 'code1'), k), 'P0001', 'habit_not_eligible',
  'F19 habit ' || k || ' (private, archived, quantity) is not eligible') from unnest(array[3, 4, 5]) k;
select tests.login(2);
select throws_ok(format($$ select public.join_group(%L, tests.h(2, 2)) $$, (select code from t_codes where k = 'code1')), 'P0001', 'already_member', 'F20 a member joining again is already_member');
select tests.login(10);
select throws_ok(format($$ select public.join_group(%L, tests.h(10, 1)) $$, (select code from t_codes where k = 'code1')), '42501', 'not_authenticated', 'F21 a deleted account cannot join');
select tests.login(4);
select tests.save('g1_join', public.join_group((select code from t_codes where k = 'code1'), tests.h(4, 1)));
select is(tests.g('g1_join'), tests.g('g1'), 'F22 join_group returns the group id');
reset role;
select is((select row(role, habit_id, left_at, joined_on, counts_from)::text from public.group_members where group_id = tests.g('g1') and user_id = tests.u(4) and left_at is null),
  row('member', tests.h(4, 1), null::timestamptz, tests.today(), public.groups_counts_from(tests.today()))::text,
  'F23 the member row carries the habit, joined_on (group zone) and counts_from');
select is((select uses from public.group_invites where code = (select code from t_codes where k = 'code1')), 1, 'F24 a join consumes one use');
select is((select count(*)::int from public.notifications where type = 'group_member_joined' and payload ->> 'group_id' = tests.g('g1')::text), 1,
  'F24b joining notifies the admins once');
select is((select user_id from public.notifications where type = 'group_member_joined' and payload ->> 'group_id' = tests.g('g1')::text), tests.u(1),
  'F24c only the admin is notified: not the joiner, not plain members');
select is((select n.payload from public.notifications n where n.type = 'group_member_joined' and n.payload ->> 'group_id' = tests.g('g1')::text),
  jsonb_build_object('group_id', tests.g('g1'), 'group_name', 'Gym crew 2', 'user_id', tests.u(4), 'display_name', 'U4 Test'),
  'F24d the payload has exactly group_id, group_name, user_id and display_name');
select is((select count(*)::int from public.notifications where type = 'group_member_joined' and payload ->> 'group_id' = tests.g('g2')::text), 0,
  'F24e creating a group notifies nobody');
set local role authenticated;
select tests.login(7);
select throws_ok(format($$ select public.join_group(%L, tests.h(7, 7)) $$, (select code from t_codes where k = 'code1')), 'P0001', 'habit_in_group',
  'F25 a habit already linked elsewhere is habit_in_group');
select tests.login(9);
select tests.save('g2', public.create_group('Grupo con foto', 'camera', 'lavanda', null, 'Foto diaria', 'camera', 5, true, tests.h(9, 6)));
insert into t_codes select 'code2', public.create_group_invite(tests.g('g2'));
select tests.login(2);
select throws_ok(format($$ select public.join_group(%L, tests.h(2, 2)) $$, (select code from t_codes where k = 'code2')), 'P0001', 'habit_not_eligible',
  'F26 a photo group refuses a habit without photo proof');
select tests.login(8);
select lives_ok(format($$ select public.join_group(%L, tests.h(8, 6)) $$, (select code from t_codes where k = 'code2')), 'F28 hugo joins the photo group with a photo habit');
select is((select count(*)::int from public.my_groups()), 1, 'F29 hugo is in exactly one group');

-- ===================================================== G. the four limits
-- seats: G3 has 49 members (creator 21 + 22..69)
reset role;
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by)
values ('d3600000-0000-0000-0000-000000000003', 'Lleno', 'barbell', 'salvia', 'Gym', 'barbell', 3, false, 'America/Santiago', tests.u(21));
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from)
select 'd3600000-0000-0000-0000-000000000003', tests.u(g), case when g = 21 then 'admin' else 'member' end, tests.h(g, 1), now() - interval '3 days',
       tests.today() - 3, public.groups_counts_from(tests.today() - 3)
from generate_series(21, 69) g;
set local role authenticated;
select tests.login(21);
insert into t_codes select 'code3', public.create_group_invite('d3600000-0000-0000-0000-000000000003');
reset role;
select is((select max_uses from public.group_invites where code = (select code from t_codes where k = 'code3')), 1, 'G1 an invite of a group with 49 members allows one use');
set local role authenticated;
select tests.login(70);
select lives_ok(format($$ select public.join_group(%L, tests.h(70, 1)) $$, (select code from t_codes where k = 'code3')), 'G2 the 50th member joins');
reset role;
select is((select count(*)::int from public.group_members where group_id = 'd3600000-0000-0000-0000-000000000003' and left_at is null), 50, 'G3 the group has 50 active members');
insert into public.group_invites (code, group_id, created_by, expires_at, max_uses) values
  ('AAAAAAAA', 'd3600000-0000-0000-0000-000000000003', tests.u(21), now() + interval '7 days', 5);
select is((public.group_invite_preview('AAAAAAAA') ->> 'full')::boolean, true, 'G4 the preview reports a full group');
set local role authenticated;
select tests.login(71);
select throws_ok($$ select public.join_group('AAAAAAAA', tests.h(71, 1)) $$, 'P0001', 'group_full', 'G5 the 51st member is refused');
select tests.login(21);
select throws_ok($$ select public.create_group_invite('d3600000-0000-0000-0000-000000000003') $$, 'P0001', 'group_full', 'G6 a full group cannot make more invites');
-- groups per person: user 20 is in 10 live groups
select tests.login(20);
select throws_ok(format($$ select public.join_group(%L, tests.h(20, 18)) $$, (select code from t_codes where k = 'code1')), 'P0001', 'group_limit', 'G7 joining an 11th group is refused');
-- admins: ana + bruno + carla, then kai is the 4th
select tests.login(1);
select lives_ok($$ select public.set_group_admin(tests.g('g1'), tests.u(2), true) $$, 'G8 a second admin');
select lives_ok($$ select public.set_group_admin(tests.g('g1'), tests.u(3), true) $$, 'G9 a third admin');
select throws_ok($$ select public.set_group_admin(tests.g('g1'), tests.u(11), true) $$, 'P0001', 'admin_limit', 'G10 the 4th admin is refused');
select lives_ok($$ select public.set_group_admin(tests.g('g1'), tests.u(3), true) $$, 'G11 naming an existing admin again is a no-op');
select lives_ok($$ select public.set_group_admin(tests.g('g1'), tests.u(2), false) $$, 'G12 an admin can be removed as admin');
select lives_ok($$ select public.set_group_admin(tests.g('g1'), tests.u(11), true) $$, 'G13 and the freed seat can be used');
select lives_ok($$ select public.set_group_admin(tests.g('g1'), tests.u(11), false) $$, 'G14 (restored)');
-- invites: asking again returns the newest valid invite made after the last removal instead of minting; 5 active at most
select tests.login(1);
insert into t_codes select 'code1b', public.create_group_invite(tests.g('g1'));
select is((select code from t_codes where k = 'code1b'), (select code from t_codes where k = 'code1'), 'G16 asking again returns the same valid invite (the cap of 5 is not burnt)');
reset role;
select is((select count(*)::int from public.group_invites where group_id = tests.g('g1')), 1, 'G16b and no row was made');
-- four older invites made before lola's removal five days ago are stale: never reused
insert into public.group_invites (code, group_id, created_by, expires_at, max_uses, created_at)
select repeat('B', 7) || (g + 1)::text, tests.g('g1'), tests.u(1), now() + interval '3 days', 10, now() - interval '10 days' from generate_series(1, 4) g;
update public.group_invites set expires_at = now() - interval '1 second' where code = (select code from t_codes where k = 'code1');
set local role authenticated;
select tests.login(1);
insert into t_codes select 'code1c', public.create_group_invite(tests.g('g1'));
select isnt((select code from t_codes where k = 'code1c'), (select code from t_codes where k = 'code1'), 'G17 with only stale and expired invites a new one is minted');
reset role;
update public.group_invites set created_at = now() - interval '10 days' where code = (select code from t_codes where k = 'code1c');
set local role authenticated;
select tests.login(1);
select throws_ok($$ select public.create_group_invite(tests.g('g1')) $$, 'P0001', 'invite_limit', 'G18 five active invites, none made after the last removal: the 6th is refused');
select tests.login(7);
select throws_ok($$ select public.revoke_group_invites(tests.g('g1')) $$, 'P0001', 'group_not_found', 'G18b revoking as a stranger is group_not_found');
select tests.login(1);
select is(public.revoke_group_invites(tests.g('g1')), 5, 'G19 an admin revokes every active invite at once and gets how many');
select is(public.revoke_group_invites(tests.g('g1')), 0, 'G19b revoking again revokes nothing');
select is(public.group_invite_preview('BBBBBBB2'), null, 'G19c a revoked invite previews as null');
insert into t_codes select 'code1d', public.create_group_invite(tests.g('g1'));
reset role;
update public.group_invites set uses = max_uses where code = (select code from t_codes where k = 'code1d');
set local role authenticated;
select tests.login(1);
select isnt(public.create_group_invite(tests.g('g1')), (select code from t_codes where k = 'code1d'), 'G20 a used-up invite is not reused, a new one is minted');

-- ===================================================== H. reads: boards, wall, my_groups
-- board group GB: wk = Monday of the current week. 13 admin (counts), 14 (counts next week), 15 (joined this week, future shortcut),
-- 16 left, 17 (rejected + other habit). target 2.
reset role;
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at)
values ('d3600000-0000-0000-0000-0000000000b1', 'Tablero', 'barbell', 'salvia', 'Gym', 'barbell', 2, false, 'America/Santiago', tests.u(13), now() - interval '20 days');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from, left_at, left_reason, is_live) values
  ('d3600000-0000-0000-0000-0000000000b1', tests.u(13), 'admin', tests.h(13, 1), now() - interval '20 days', tests.wk() - 14, tests.wk(), null, null, true),
  ('d3600000-0000-0000-0000-0000000000b1', tests.u(14), 'member', tests.h(14, 1), now() - interval '2 days', tests.wk(), tests.wk() + 7, null, null, true),
  ('d3600000-0000-0000-0000-0000000000b1', tests.u(15), 'member', tests.h(15, 1), now() - interval '2 days', tests.wk() + 1, tests.wk() + 7, null, null, true),
  ('d3600000-0000-0000-0000-0000000000b1', tests.u(16), 'member', tests.h(16, 1), now() - interval '9 days', tests.wk() - 9, tests.wk() - 7, now() - interval '1 day', 'left', false),
  ('d3600000-0000-0000-0000-0000000000b1', tests.u(17), 'member', tests.h(17, 1), now() - interval '20 days', tests.wk() - 14, tests.wk(), null, null, true);
insert into public.checkins (habit_id, user_id, local_date) values
  (tests.h(13, 1), tests.u(13), tests.wk()), (tests.h(13, 1), tests.u(13), tests.wk() + 1),
  (tests.h(13, 2), tests.u(13), tests.wk() + 2),                                   -- another habit of 13: never counted
  (tests.h(13, 1), tests.u(13), tests.wk() - 3),                                   -- last week: never counted
  (tests.h(15, 1), tests.u(15), tests.wk()), (tests.h(15, 1), tests.u(15), tests.wk() + 1), -- 15: one before joined_on, one after
  (tests.h(16, 1), tests.u(16), tests.wk()),                                       -- 16 left
  (tests.h(17, 1), tests.u(17), tests.wk() + 3);
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, rejected_at, rejected_by, reject_reason) values
  (tests.c(17, 1), tests.h(17, 1), tests.u(17), tests.wk() + 4, tests.u(17)::text || '/' || tests.c(17, 1)::text || '.jpg', now(), tests.u(13), 'unclear');
set local role authenticated;
select tests.login(13);
select is((select array_agg(row(username, role, counts, done, target)::text order by ord) from (
    select b.*, row_number() over () ord from public.group_board('d3600000-0000-0000-0000-0000000000b1') b) b),
  array[row('g36_013', 'admin', true, 2, 2)::text, row('g36_015', 'member', false, 1, 2)::text, row('g36_017', 'member', true, 1, 2)::text, row('g36_014', 'member', false, 0, 2)::text],
  'H1 the board lists active members ordered by progress: counts false until counts_from, other habits, old weeks, rejected and pre-joined_on check-ins are ignored, members who left are absent');
select is((select array_agg(k order by k)::text from jsonb_object_keys((select to_jsonb(b) from public.group_board('d3600000-0000-0000-0000-0000000000b1') b limit 1)) k),
  '{avatar_path,avatar_preset,counts,display_name,done,joined_on,role,target,user_id,username}', 'H2 the board returns only the listed fields');
select is((select row(m.my_done, m.my_counts, m.complied_count, m.counted_count, m.streak, m.archived, m.role, m.member_count, m.target_per_week)::text
  from public.my_groups() m where m.id = 'd3600000-0000-0000-0000-0000000000b1'),
  row(2, true, 1, 2, 0, false, 'admin', 4, 2)::text, 'H3 my_groups: my week, how many comply of how many count, streak, role and member count');
select is((select m.my_habit_id from public.my_groups() m where m.id = 'd3600000-0000-0000-0000-0000000000b1'), tests.h(13, 1), 'H3b my_groups returns my linked habit');
select is((select array_agg(k order by k)::text from jsonb_object_keys((select to_jsonb(m) from public.my_groups() m limit 1)) k),
  '{archived,color,commitment_icon,commitment_name,complied_count,counted_count,icon,id,member_count,my_counts,my_done,my_habit_id,name,requires_photo,role,streak,target_per_week}',
  'H4 my_groups returns the listed fields');
select is((select row(d.my_role, d.my_habit_id, d.member_count, d.streak, d.timezone)::text from public.group_detail('d3600000-0000-0000-0000-0000000000b1') d),
  row('admin', tests.h(13, 1), 4, 0, 'America/Santiago')::text, 'H5 group_detail: my role, my linked habit, streak and member count');
-- a non-member, a removed member, a member of another group and a deleted account learn nothing
select tests.login(7);
select throws_ok(format($$ select * from public.%s $$, q), 'P0001', 'group_not_found', 'H6 a stranger: ' || split_part(q, '(', 1)) from unnest(array[
  $$group_detail('d3600000-0000-0000-0000-0000000000b1')$$, $$group_board('d3600000-0000-0000-0000-0000000000b1')$$,
  $$group_wall('d3600000-0000-0000-0000-0000000000b1')$$, $$group_history('d3600000-0000-0000-0000-0000000000b1')$$,
  $$group_week_detail('d3600000-0000-0000-0000-0000000000b1', date '2026-11-02')$$]) q;
select tests.login(8);
select throws_ok(format($$ select * from public.%s $$, q), 'P0001', 'group_not_found', 'H7 a member of another group: ' || split_part(q, '(', 1)) from unnest(array[
  $$group_detail(tests.g('g1'))$$, $$group_board(tests.g('g1'))$$, $$group_wall(tests.g('g1'))$$, $$group_history(tests.g('g1'))$$,
  $$group_week_detail(tests.g('g1'), date '2026-11-02')$$]) q;
select tests.login(12);
select throws_ok(format($$ select * from public.%s $$, q), 'P0001', 'group_not_found', 'H8 a removed member: ' || split_part(q, '(', 1)) from unnest(array[
  $$group_detail(tests.g('g1'))$$, $$group_board(tests.g('g1'))$$, $$group_wall(tests.g('g1'))$$, $$group_history(tests.g('g1'))$$,
  $$group_week_detail(tests.g('g1'), date '2026-11-02')$$]) q;
select tests.login(10);
select throws_ok(format($$ select * from public.%s $$, q), '42501', 'not_authenticated', 'H9 a deleted account: ' || split_part(q, '(', 1)) from unnest(array[
  $$my_groups()$$, $$group_board(tests.g('g1'))$$, $$group_wall(tests.g('g1'))$$]) q;
select tests.login(7);
select is((select count(*)::int from public.my_groups()), 1, 'H10 my_groups lists only my own groups (gus is in the group he created)');

-- the wall of G1. visible: ana c(1,1), bruno c(2,1) + c(2,4), carla c(3,1) + c(3,3), kai c(11,1)
reset role;
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at) values
  (tests.c(1, 1), tests.h(1, 1), tests.u(1), tests.today(), tests.u(1)::text || '/' || tests.c(1, 1)::text || '.jpg', now() - interval '1 minute'),
  (tests.c(2, 1), tests.h(2, 1), tests.u(2), tests.today(), tests.u(2)::text || '/' || tests.c(2, 1)::text || '.jpg', now() - interval '2 minutes'),
  (tests.c(3, 1), tests.h(3, 1), tests.u(3), tests.today(), tests.u(3)::text || '/' || tests.c(3, 1)::text || '.jpg', now() - interval '3 minutes'),
  (tests.c(11, 1), tests.h(11, 1), tests.u(11), tests.today(), tests.u(11)::text || '/' || tests.c(11, 1)::text || '.jpg', now() - interval '4 minutes'),
  (tests.c(2, 4), tests.h(2, 1), tests.u(2), tests.today() - 1, null, now() - interval '5 minutes'),
  (tests.c(3, 3), tests.h(3, 1), tests.u(3), tests.today() - 2, tests.u(3)::text || '/' || tests.c(3, 3)::text || '.jpg', now() - interval '6 minutes'),
  -- never on the wall: before joined_on, another habit of bruno, a rejected one, and a member who was removed
  (tests.c(2, 2), tests.h(2, 1), tests.u(2), tests.today() - 12, tests.u(2)::text || '/' || tests.c(2, 2)::text || '.jpg', now() - interval '7 minutes'),
  (tests.c(2, 3), tests.h(2, 2), tests.u(2), tests.today(), tests.u(2)::text || '/' || tests.c(2, 3)::text || '.jpg', now() - interval '8 minutes'),
  (tests.c(12, 1), tests.h(12, 1), tests.u(12), tests.today(), tests.u(12)::text || '/' || tests.c(12, 1)::text || '.jpg', now() - interval '9 minutes');
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at, rejected_at, rejected_by, reject_reason) values
  (tests.c(3, 2), tests.h(3, 1), tests.u(3), tests.today() - 1, tests.u(3)::text || '/' || tests.c(3, 2)::text || '.jpg', now() - interval '10 minutes', now(), tests.u(1), 'not_habit');
set local role authenticated;
select tests.login(1);
select is((select array_agg(checkin_id order by ord) from (select w.*, row_number() over () ord from public.group_wall(tests.g('g1')) w) w),
  array[tests.c(1, 1), tests.c(2, 1), tests.c(3, 1), tests.c(11, 1), tests.c(2, 4), tests.c(3, 3)],
  'H11 the wall is newest first and shows only linked habits of active members, from joined_on, not rejected');
select is((select array_agg(k order by k)::text from jsonb_object_keys((select to_jsonb(w) from public.group_wall(tests.g('g1')) w limit 1)) k),
  '{avatar_path,avatar_preset,checkin_id,created_at,display_name,local_date,photo_path,user_id,username}', 'H12 the wall returns only the listed fields');
select is((select array_agg(checkin_id order by ord) from (select w.*, row_number() over () ord from public.group_wall(tests.g('g1'), null, null, 2) w) w),
  array[tests.c(1, 1), tests.c(2, 1)], 'H13 keyset page 1 (limit 2)');
insert into t_cur select 'p1', created_at, checkin_id from public.group_wall(tests.g('g1'), null, null, 2) order by created_at asc, checkin_id asc limit 1;
select is((select array_agg(checkin_id order by ord) from (select w.*, row_number() over () ord
    from public.group_wall(tests.g('g1'), (select ts from t_cur where k = 'p1'), (select id from t_cur where k = 'p1'), 2) w) w),
  array[tests.c(3, 1), tests.c(11, 1)], 'H14 keyset page 2 follows the cursor');
insert into t_cur select 'p2', created_at, checkin_id from public.group_wall(tests.g('g1'), (select ts from t_cur where k = 'p1'), (select id from t_cur where k = 'p1'), 2)
  order by created_at asc, checkin_id asc limit 1;
select is((select array_agg(checkin_id order by ord) from (select w.*, row_number() over () ord
    from public.group_wall(tests.g('g1'), (select ts from t_cur where k = 'p2'), (select id from t_cur where k = 'p2'), 2) w) w),
  array[tests.c(2, 4), tests.c(3, 3)], 'H15 keyset page 3');
select is((select count(*)::int from public.group_wall(tests.g('g1'), now() - interval '6 minutes', tests.c(3, 3), 2)), 0, 'H16 past the last row the page is empty');
select is((select count(*)::int from public.group_wall(tests.g('g1'), null, null, 0)), 1, 'H17 a limit of 0 is clamped to 1');
select is((select count(*)::int from public.group_wall(tests.g('g1'), null, null, -5)), 1, 'H18 a negative limit is clamped to 1');
select is((select count(*)::int from public.group_wall(tests.g('g1'), null, null, 1000000)), 6, 'H19 a huge limit is clamped to 50 (all 6 rows)');
select is((select count(*)::int from public.group_wall(tests.g('g1'), null, null, null)), 6, 'H20 a null limit means 20');
select is((select count(*)::int from public.group_wall(tests.g('g1'), now() + interval '1 day', null, 50)), 6, 'H21 a cursor without id filters by instant only');

-- ===================================================== I. proofs (storage.objects) as different identities
reset role;
insert into public.habit_items (id, habit_id, user_id, label, position) values
  ('e4600000-0000-0000-0000-000000000001', tests.h(2, 1), tests.u(2), 'Paso', 1);
insert into public.checkin_items (id, item_id, habit_id, user_id, local_date, photo_path) values
  ('e4600000-0000-0000-0000-000000000002', 'e4600000-0000-0000-0000-000000000001', tests.h(2, 1), tests.u(2), tests.today(),
   tests.u(2)::text || '/items/e4600000-0000-0000-0000-000000000002.jpg');
-- bruno: a private habit with a photo
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at) values
  (tests.c(2, 8), tests.h(2, 3), tests.u(2), tests.today(), tests.u(2)::text || '/' || tests.c(2, 8)::text || '.jpg', now());
insert into storage.objects (bucket_id, name, owner)
select 'proofs', n, null from unnest(array[
  tests.u(1)::text || '/' || tests.c(1, 1)::text || '.jpg',      -- ana, linked, from joined_on
  tests.u(2)::text || '/' || tests.c(2, 1)::text || '.jpg',      -- P1 bruno, linked, from joined_on
  tests.u(2)::text || '/' || tests.c(2, 2)::text || '.jpg',      -- P2 bruno, linked habit but BEFORE joined_on
  tests.u(2)::text || '/' || tests.c(2, 3)::text || '.jpg',      -- P3 bruno, another (non-linked) habit
  tests.u(2)::text || '/items/e4600000-0000-0000-0000-000000000002.jpg', -- P4 a step photo
  tests.u(2)::text || '/' || tests.c(2, 8)::text || '.jpg',      -- P8 private habit
  tests.u(2)::text || '/b3600000-0000-0000-0000-00000000ffff.jpg', -- P7 an object that belongs to no check-in
  tests.u(3)::text || '/' || tests.c(3, 1)::text || '.jpg',      -- P9 carla, linked
  tests.u(3)::text || '/' || tests.c(3, 2)::text || '.jpg',      -- P5 carla, rejected
  tests.u(11)::text || '/' || tests.c(11, 1)::text || '.jpg',    -- P6 kai, linked
  tests.u(12)::text || '/' || tests.c(12, 1)::text || '.jpg']) n; -- lola, removed
set local role authenticated;
select tests.login(1);
select is((select array_agg(name order by name) from storage.objects where bucket_id = 'proofs'
    and name like any (array[tests.u(1)::text || '/%', tests.u(2)::text || '/%', tests.u(3)::text || '/%', tests.u(11)::text || '/%', tests.u(12)::text || '/%'])),
  (select array_agg(n order by n) from unnest(array[tests.p(1, 1), tests.p(2, 1), tests.p(3, 1), tests.p(11, 1)]) n),
  'I1 a fellow member (not a friend) reads only the photos of linked check-ins from joined_on, not rejected: not before joined_on, not other habits, not step photos, not orphans, not rejected, not a removed member''s');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.u(2)::text || '/' || tests.c(2, 2)::text || '.jpg'), 0,
  'I2 a photo dated before the owner''s joined_on stays private to a fellow member');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.u(2)::text || '/items/e4600000-0000-0000-0000-000000000002.jpg'), 0,
  'I3 a step photo is not readable through the group branch');
select tests.login(3);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.u(2)::text || '/' || tests.c(2, 1)::text || '.jpg'), 1,
  'I4 carla reads bruno''s linked photo');
select tests.login(7);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs'
  and name like any (array[tests.u(1)::text || '/%', tests.u(2)::text || '/%', tests.u(3)::text || '/%', tests.u(11)::text || '/%'])), 0,
  'I5 a stranger reads none of them');
select tests.login(8);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs'
  and name like any (array[tests.u(1)::text || '/%', tests.u(2)::text || '/%', tests.u(3)::text || '/%', tests.u(11)::text || '/%'])), 0,
  'I6 a member of a different group reads none of them');
select tests.login(12);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs'
  and name like any (array[tests.u(1)::text || '/%', tests.u(2)::text || '/%', tests.u(3)::text || '/%', tests.u(11)::text || '/%'])), 0,
  'I7 a removed member reads none of them');
select tests.login(6);
select is((select array_agg(name order by name) from storage.objects where bucket_id = 'proofs' and name like tests.u(2)::text || '/%'),
  (select array_agg(n order by n) from unnest(array[tests.p(2, 1), tests.p(2, 2), tests.p(2, 3), tests.u(2)::text || '/items/e4600000-0000-0000-0000-000000000002.jpg']) n),
  'I8 friend access is unchanged: a friend reads check-in and step photos of non-private habits, regardless of joined_on, and not the private one nor an orphan');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name like tests.u(3)::text || '/%'), 0, 'I9 the friend of bruno reads nothing of carla');
select tests.login(2);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name like tests.u(2)::text || '/%'), 6, 'I10 the owner branch is unchanged: bruno reads all six of his objects');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name like tests.u(1)::text || '/%'), 1, 'I11 bruno (a fellow member) reads ana''s linked photo');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('proofs', 'x/y.jpg', null) $$, '42501', null, 'I12 clients still cannot write proofs objects');

-- ===================================================== J. habit guards (habit_in_group)
select tests.login(2);
select throws_ok(q, 'P0001', 'habit_in_group', 'J1 ' || d) from (values
  ($$ update public.habits set visibility = 'private' where id = tests.h(2, 1) $$, 'a linked habit cannot become private'),
  ($$ update public.habits set archived_at = now() where id = tests.h(2, 1) $$, 'a linked habit cannot be archived'),
  ($$ delete from public.habits where id = tests.h(2, 1) $$, 'a linked habit cannot be deleted'),
  ($$ update public.habits set log_type = 'quantity', quantity_unit = 'times', quantity_target = 3, quantity_step = 1 where id = tests.h(2, 1) $$, 'a linked habit cannot become a quantity habit')) v(q, d);
select lives_ok($$ update public.habits set name = 'Renombrado' where id = tests.h(2, 1) $$, 'J2 other edits of a linked habit are fine');
select tests.login(1);
select lives_ok($$ update public.habits set requires_photo = true where id = tests.h(1, 1) $$, 'J3 a linked habit may start asking for a photo');
select lives_ok($$ update public.habits set requires_photo = false where id = tests.h(1, 1) $$, 'J4 and stop asking while the group does not require one');
select tests.login(2);
select lives_ok($$ update public.habits set visibility = 'private' where id = tests.h(2, 2) $$, 'J5 an unlinked habit of the same person is free');
select lives_ok($$ update public.habits set archived_at = now() where id = tests.h(2, 2) $$, 'J6 and can be archived');
select tests.login(9);
select throws_ok($$ update public.habits set requires_photo = false where id = tests.h(9, 6) $$, 'P0001', 'habit_in_group', 'J7 a habit cannot lose photo proof while its group requires a photo');
select tests.login(2);
select throws_ok($$ update public.habits set visibility = 'private' where id = tests.h(2, 7) $$, 'P0001', 'habit_in_challenge', 'J8 the challenge guard still raises habit_in_challenge');
reset role;
select lives_ok($$ update public.habits set visibility = 'private' where id = tests.h(2, 1) $$, 'J9 the table owner (service paths) is not subject to the client guard');
update public.habits set visibility = 'friends' where id = tests.h(2, 1);
set local role service_role;
select lives_ok($$ update public.habits set archived_at = null where id = tests.h(2, 1) $$, 'J10 the service role is not subject to the client guard');
reset role;
-- leaving ends the link at once
set local role authenticated;
select tests.login(11);
select lives_ok($$ select public.leave_group(tests.g('g1')) $$, 'J11 kai leaves the group');
select lives_ok($$ update public.habits set visibility = 'private' where id = tests.h(11, 1) $$, 'J12 after leaving, his habit is free again');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.u(11)::text || '/' || tests.c(11, 1)::text || '.jpg'), 1, 'J13 the owner still reads his own photo');
select tests.login(1);
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name = tests.u(11)::text || '/' || tests.c(11, 1)::text || '.jpg'), 0, 'J14 once someone leaves, their photos stop being readable by the others');
select is((select count(*)::int from public.group_wall(tests.g('g1')) where user_id = tests.u(11)), 0, 'J15 and their check-ins leave the wall');
select is((select count(*)::int from public.group_board(tests.g('g1')) where user_id = tests.u(11)), 0, 'J16 and the board');
select tests.login(11);
select throws_ok($$ select * from public.group_wall(tests.g('g1')) $$, 'P0001', 'group_not_found', 'J17 someone who left no longer sees the wall');
select throws_ok($$ select public.leave_group(tests.g('g1')) $$, 'P0001', 'group_not_found', 'J18 leaving twice is group_not_found');
reset role;
select is((select row(left_reason, is_live, left_at is not null)::text from public.group_members where group_id = tests.g('g1') and user_id = tests.u(11)),
  row('left', false, true)::text, 'J19 the membership row records the leaving');

-- ===================================================== K. leave / remove / admin rules (group GR, users 73..75)
set local role authenticated;
select tests.login(73);
select tests.save('gr', public.create_group('Equipo', 'target', 'oliva', null, 'Correr', 'sneaker-move', 4, false, tests.h(73, 1)));
insert into t_codes select 'coder', public.create_group_invite(tests.g('gr'));
select tests.login(74);
select public.join_group((select code from t_codes where k = 'coder'), tests.h(74, 1));
select tests.login(75);
select public.join_group((select code from t_codes where k = 'coder'), tests.h(75, 1));
select tests.login(73);
select throws_ok($$ select public.leave_group(tests.g('gr')) $$, 'P0001', 'last_admin', 'K1 the only admin cannot leave while others remain');
select throws_ok($$ select public.set_group_admin(tests.g('gr'), tests.u(73), false) $$, 'P0001', 'last_admin', 'K2 the only admin cannot be demoted');
select throws_ok($$ select public.set_group_admin(tests.g('gr'), tests.u(99), true) $$, 'P0001', 'not_group_member', 'K3 naming someone who is not in the group');
select throws_ok($$ select public.remove_group_member(tests.g('gr'), tests.u(99)) $$, 'P0001', 'not_group_member', 'K4 removing someone who is not in the group');
select throws_ok($$ select public.remove_group_member(tests.g('gr'), tests.u(73)) $$, 'P0001', 'cannot_remove_self', 'K5 an admin cannot remove themselves (they leave)');
select tests.login(74);
select throws_ok($$ select public.remove_group_member(tests.g('gr'), tests.u(75)) $$, 'P0001', 'not_group_admin', 'K6 a member cannot remove anyone');
select tests.login(73);
select lives_ok($$ select public.set_group_admin(tests.g('gr'), tests.u(74), true) $$, 'K7 the admin names a second admin');
select lives_ok($$ select public.leave_group(tests.g('gr')) $$, 'K8 and may now leave');
select tests.login(74);
select throws_ok($$ select public.leave_group(tests.g('gr')) $$, 'P0001', 'last_admin', 'K9 the new only admin cannot leave while 75 remains');
select lives_ok($$ select public.remove_group_member(tests.g('gr'), tests.u(75)) $$, 'K10 an admin removes a member');
select tests.login(75);
select throws_ok($$ select * from public.group_board(tests.g('gr')) $$, 'P0001', 'group_not_found', 'K11 a removed member sees nothing');
select throws_ok(format($$ select public.join_group(%L, tests.h(75, 1)) $$, (select code from t_codes where k = 'coder')), 'P0001', 'invite_not_found',
  'K12 a removed member cannot come back with an invite made before the removal (no hint)');
select tests.login(74);
insert into t_codes select 'coder2', public.create_group_invite(tests.g('gr'));
select isnt((select code from t_codes where k = 'coder2'), (select code from t_codes where k = 'coder'), 'K12a the old invite is not reused after a removal: a new one is minted');
select tests.login(75);
select lives_ok(format($$ select public.join_group(%L, tests.h(75, 1)) $$, (select code from t_codes where k = 'coder2')), 'K12b an invite made after the removal lets them in again (an admin chose it)');
reset role;
select is((select count(*)::int from public.group_members where group_id = tests.g('gr') and user_id = tests.u(75)), 2, 'K13 rejoining adds a row and keeps the old one');
select is((select count(*)::int from public.group_members where group_id = tests.g('gr') and user_id = tests.u(75) and left_at is null), 1, 'K14 with exactly one active membership');
select is((select array_agg(user_id order by user_id) from public.notifications where type = 'group_member_joined' and payload ->> 'group_id' = tests.g('gr')::text),
  array[tests.u(73), tests.u(73), tests.u(74)], 'K14b join notifications: admins of that moment only (73 twice, 74 once), nobody who had left, never the joiner');
set local role authenticated;
select tests.login(74);
select lives_ok($$ select public.remove_group_member(tests.g('gr'), tests.u(75)) $$, 'K15 removed again');
select lives_ok($$ select public.leave_group(tests.g('gr')) $$, 'K16 the last member can leave');
reset role;
select isnt((select archived_at from public.groups where id = tests.g('gr')), null, 'K17 the group is archived when its last member leaves');
set local role authenticated;
select tests.login(1);
select tests.login(9);
select lives_ok($$ select public.archive_group(tests.g('g2')) $$, 'K18 an admin archives the group');
select throws_ok(format($$ select public.%s $$, q), 'P0001', 'group_archived', 'K19 an archived group is read-only: ' || split_part(q, '(', 1)) from unnest(array[
  $$update_group(tests.g('g2'), 'Otro nombre', 'camera', 'lavanda', null)$$,
  $$set_group_commitment(tests.g('g2'), 'Foto', 'camera', 5, true)$$,
  $$archive_group(tests.g('g2'))$$,
  $$create_group_invite(tests.g('g2'))$$,
  $$revoke_group_invites(tests.g('g2'))$$,
  $$remove_group_member(tests.g('g2'), tests.u(8))$$,
  $$set_group_admin(tests.g('g2'), tests.u(8), true)$$]) q;
select is((select archived from public.my_groups() m where m.id = tests.g('g2')), true, 'K20 my_groups flags the archived group');
select is(public.group_invite_preview((select code from t_codes where k = 'code2')), null, 'K21 an archived group''s invite previews as null');
select tests.login(7);
select throws_ok(format($$ select public.join_group(%L, tests.h(7, 8)) $$, (select code from t_codes where k = 'code2')), 'P0001', 'invite_not_found', 'K22 an archived group''s invite cannot be used');
select tests.login(9);
select lives_ok($$ update public.habits set requires_photo = false where id = tests.h(9, 6) $$, 'K23 archiving a group frees the habits linked to it');

-- ===================================================== L. a closed week cannot lose a check-in (period_closed)
reset role;
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at) values
  ('d3600000-0000-0000-0000-0000000000a1', 'Cerrada', 'barbell', 'salvia', 'Gym', 'barbell', 2, false, 'America/Santiago', tests.u(18), timestamptz '2026-10-01 10:00 America/Santiago');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from) values
  ('d3600000-0000-0000-0000-0000000000a1', tests.u(18), 'admin', tests.h(18, 1), timestamptz '2026-10-01 10:00 America/Santiago', date '2026-10-01', date '2026-10-05');
insert into public.group_weeks (group_id, week_start, closed_at, commitment_name, target_per_week, requires_photo, members_counted, members_complied) values
  ('d3600000-0000-0000-0000-0000000000a1', date '2026-10-12', now(), 'Gym', 2, false, 1, 1);
insert into public.checkins (habit_id, user_id, local_date) values
  (tests.h(18, 1), tests.u(18), date '2026-09-30'),   -- before joined_on, in no closed week
  (tests.h(18, 1), tests.u(18), date '2026-10-13'),   -- inside the closed week
  (tests.h(18, 1), tests.u(18), date '2026-10-20');   -- in a week that is not closed
set local role authenticated;
select tests.login(18);
select is(public.habit_date_period_closed(tests.h(18, 1), date '2026-10-13'), true, 'L1 habit_date_period_closed is true inside a closed group week of the linked habit');
select is(public.habit_date_period_closed(tests.h(18, 1), date '2026-10-20'), false, 'L2 and false in an open week');
select is(public.habit_date_period_closed(tests.h(18, 1), date '2026-09-30'), false, 'L3 and false before the member joined');
select throws_ok($$ delete from public.checkins where habit_id = tests.h(18, 1) and local_date = date '2026-10-13' $$, 'P0001', 'period_closed',
  'L4 deleting a check-in inside a closed group week is refused');
select lives_ok($$ delete from public.checkins where habit_id = tests.h(18, 1) and local_date = date '2026-10-20' $$, 'L5 an open week can still be undone');
select lives_ok($$ delete from public.checkins where habit_id = tests.h(18, 1) and local_date = date '2026-09-30' $$, 'L6 a check-in from before joining stays deletable');
select tests.login(19);
select is(public.habit_date_period_closed(tests.h(18, 1), date '2026-10-13'), false, 'L7 other people''s habits answer false (ids cannot be probed)');
select tests.login(2);
select is(public.habit_date_period_closed(tests.h(2, 30), tests.today() - 28), true, 'L8 challenge behaviour unchanged: a closed challenge period is closed');
select is(public.habit_date_period_closed(tests.h(2, 30), tests.today() - 20), false, 'L9 challenge behaviour unchanged: an open period is open');
select throws_ok($$ delete from public.checkins where habit_id = tests.h(2, 30) and local_date = tests.today() - 28 $$, 'P0001', 'period_closed',
  'L10 challenge behaviour unchanged: the delete guard still refuses with period_closed');
select lives_ok($$ delete from public.checkins where habit_id = tests.h(2, 30) and local_date = tests.today() - 20 $$, 'L11 and still allows the open period');
select tests.nosession();
select is(public.habit_date_period_closed(tests.h(18, 1), date '2026-10-13'), false, 'L12 without a session the helper answers false');
reset role;

-- ===================================================== M. weekly closing (as the service role)
-- isolate: every other group made so far is archived, so only the groups below are due
update public.groups set archived_at = coalesce(archived_at, now());
select is((select count(*)::int from public.groups where archived_at is null), 0, 'M0 every group made so far is archived, so only the closing fixtures are due');
-- Gc: the main group. created Sunday 2026-11-01. 101 admin, 102, 103 (joined Wednesday 11-04), 104 (left 11-12), 105 (removed 11-05)
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at,
                           next_commitment_name, next_commitment_icon, next_target_per_week, next_requires_photo, next_effective_from) values
  ('d3600000-0000-0000-0000-0000000000c1', 'Cierre', 'barbell', 'salvia', 'Gym', 'barbell', 3, false, 'America/Santiago', tests.u(101),
   timestamptz '2026-11-01 10:00 America/Santiago', 'Gym 5', 'barbell', 5, false, date '2026-12-07');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from, left_at, left_reason, is_live) values
  ('d3600000-0000-0000-0000-0000000000c1', tests.u(101), 'admin', tests.h(101, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', null, null, true),
  ('d3600000-0000-0000-0000-0000000000c1', tests.u(102), 'member', tests.h(102, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02', null, null, true),
  ('d3600000-0000-0000-0000-0000000000c1', tests.u(103), 'member', tests.h(103, 1), timestamptz '2026-11-04 12:00 America/Santiago', date '2026-11-04', date '2026-11-09', null, null, true),
  ('d3600000-0000-0000-0000-0000000000c1', tests.u(104), 'member', tests.h(104, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02',
   timestamptz '2026-11-12 09:00 America/Santiago', 'left', false),
  ('d3600000-0000-0000-0000-0000000000c1', tests.u(105), 'member', tests.h(105, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02',
   timestamptz '2026-11-05 09:00 America/Santiago', 'removed', false);
insert into public.checkins (habit_id, user_id, local_date)
select tests.h(u, k), tests.u(u), d::date from (values
  (101, 1, '2026-11-02'), (101, 1, '2026-11-03'), (101, 1, '2026-11-04'),
  (102, 1, '2026-11-02'), (102, 1, '2026-11-03'), (102, 2, '2026-11-02'), (102, 2, '2026-11-03'), (102, 2, '2026-11-04'),
  (104, 1, '2026-11-02'), (104, 1, '2026-11-03'), (104, 1, '2026-11-04'),
  (105, 1, '2026-11-02'), (105, 1, '2026-11-03'), (105, 1, '2026-11-04'),
  (103, 1, '2026-11-02'), (103, 1, '2026-11-03'),
  (101, 1, '2026-11-09'), (101, 1, '2026-11-10'), (101, 1, '2026-11-11'),
  (102, 1, '2026-11-09'), (102, 1, '2026-11-10'), (102, 1, '2026-11-11'),
  (103, 1, '2026-11-09'), (104, 1, '2026-11-09'), (104, 1, '2026-11-13'),
  (101, 1, '2026-11-16'), (101, 1, '2026-11-17'), (101, 1, '2026-11-18'),
  (103, 1, '2026-11-16'), (103, 1, '2026-11-17'), (103, 1, '2026-11-18')) v(u, k, d);
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, rejected_at, rejected_by, reject_reason) values
  (tests.c(102, 9), tests.h(102, 1), tests.u(102), date '2026-11-04', tests.u(102)::text || '/' || tests.c(102, 9)::text || '.jpg', now(), tests.u(101), 'unclear');
-- 102 has a deleted account but a live membership row (as if the profile was scrubbed without the trigger): never notified
set local session_replication_role = replica;
update public.profiles set deleted_at = now() where id = tests.u(102);
set local session_replication_role = origin;
-- Gq: a pending commitment change effective 2026-11-09
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at,
                           next_commitment_name, next_commitment_icon, next_target_per_week, next_requires_photo, next_effective_from) values
  ('d3600000-0000-0000-0000-0000000000c2', 'Cambio', 'barbell', 'salvia', 'Gym 3', 'barbell', 3, false, 'America/Santiago', tests.u(121),
   timestamptz '2026-11-01 10:00 America/Santiago', 'Gym 2', 'target', 2, false, date '2026-11-09');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from) values
  ('d3600000-0000-0000-0000-0000000000c2', tests.u(121), 'admin', tests.h(121, 1), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02');
insert into public.checkins (habit_id, user_id, local_date)
select tests.h(121, 1), tests.u(121), d::date from unnest(array['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-16', '2026-11-17']) d;
-- Gp: photo commitment, target 2
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at) values
  ('d3600000-0000-0000-0000-0000000000c3', 'Foto', 'camera', 'salvia', 'Foto', 'camera', 2, true, 'America/Santiago', tests.u(111), timestamptz '2026-11-01 10:00 America/Santiago');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from) values
  ('d3600000-0000-0000-0000-0000000000c3', tests.u(111), 'admin', tests.h(111, 6), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02'),
  ('d3600000-0000-0000-0000-0000000000c3', tests.u(112), 'member', tests.h(112, 6), timestamptz '2026-11-01 10:00 America/Santiago', date '2026-11-01', date '2026-11-02');
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at, rejected_at, rejected_by, reject_reason)
select tests.c(u, k), tests.h(u, 6), tests.u(u), d::date,
       case when photo then tests.u(u)::text || '/' || tests.c(u, k)::text || '.jpg' end,
       d::date::timestamptz + interval '12 hours', case when rej then now() end, case when rej then tests.u(111) end, case when rej then 'unclear' end
from (values
  (111, 21, '2026-11-09', true, false), (111, 22, '2026-11-10', true, false), (111, 23, '2026-11-11', false, false),
  (112, 21, '2026-11-09', true, true), (112, 22, '2026-11-10', true, false), (112, 23, '2026-11-11', false, false),
  (111, 24, '2026-11-22', true, false)) v(u, k, d, photo, rej);
-- an archived group is never closed
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at, archived_at) values
  ('d3600000-0000-0000-0000-0000000000c4', 'Archivada', 'barbell', 'salvia', 'Gym', 'barbell', 3, false, 'America/Santiago', tests.u(131), timestamptz '2026-11-01 10:00 America/Santiago', now());
-- Gz (Santiago) and Ga (Auckland): same dates, different zones. created Monday 2026-11-09
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at) values
  ('d3600000-0000-0000-0000-0000000000c5', 'Santiago', 'barbell', 'salvia', 'Gym', 'barbell', 1, false, 'America/Santiago', tests.u(132), timestamptz '2026-11-09 10:00 America/Santiago'),
  ('d3600000-0000-0000-0000-0000000000c6', 'Auckland', 'barbell', 'salvia', 'Gym', 'barbell', 1, false, 'Pacific/Auckland', tests.u(133), timestamptz '2026-11-09 10:00 Pacific/Auckland');
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from) values
  ('d3600000-0000-0000-0000-0000000000c5', tests.u(132), 'admin', tests.h(132, 1), timestamptz '2026-11-09 10:00 America/Santiago', date '2026-11-09', date '2026-11-09'),
  ('d3600000-0000-0000-0000-0000000000c6', tests.u(133), 'admin', tests.h(133, 1), timestamptz '2026-11-09 10:00 Pacific/Auckland', date '2026-11-09', date '2026-11-09');
insert into public.checkins (habit_id, user_id, local_date) values
  (tests.h(132, 1), tests.u(132), date '2026-11-10'), (tests.h(133, 1), tests.u(133), date '2026-11-10'),
  (tests.h(132, 1), tests.u(132), date '2026-11-17'), (tests.h(133, 1), tests.u(133), date '2026-11-17');
-- the group weeks of the streak groups are hand-written (the closing function is tested above)
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at, archived_at) values
  ('d3600000-0000-0000-0000-0000000000d1', 'Racha 1', 'barbell', 'salvia', 'Gym', 'barbell', 1, false, 'America/Santiago', tests.u(141), now() - interval '90 days', now()),
  ('d3600000-0000-0000-0000-0000000000d2', 'Racha 2', 'barbell', 'salvia', 'Gym', 'barbell', 1, false, 'America/Santiago', tests.u(142), now() - interval '90 days', now()),
  ('d3600000-0000-0000-0000-0000000000d3', 'Racha 3', 'barbell', 'salvia', 'Gym', 'barbell', 1, false, 'America/Santiago', tests.u(143), now() - interval '90 days', now());
-- Racha 1, oldest to newest: ok, fail, ok, zero, ok, ok  ->  streak 3 (the zero week neither breaks nor extends)
insert into public.group_weeks (group_id, week_start, closed_at, commitment_name, target_per_week, requires_photo, members_counted, members_complied)
select 'd3600000-0000-0000-0000-0000000000d1', date '2026-08-03' + 7 * i, now(), 'Gym', 1, false, c, k
from (values (0, 4, 2), (1, 4, 1), (2, 3, 2), (3, 0, 0), (4, 2, 1), (5, 5, 5)) v(i, c, k);
-- Racha 2: a zero week and a fail at the end  ->  streak 0
insert into public.group_weeks (group_id, week_start, closed_at, commitment_name, target_per_week, requires_photo, members_counted, members_complied)
select 'd3600000-0000-0000-0000-0000000000d2', date '2026-08-03' + 7 * i, now(), 'Gym', 1, false, c, k
from (values (0, 2, 2), (1, 0, 0), (2, 3, 1)) v(i, c, k);
select is(public.groups_streak('d3600000-0000-0000-0000-0000000000d1'), 3, 'M1 streak: a zero-member week neither breaks nor extends, a failed week breaks');
select is(public.groups_streak('d3600000-0000-0000-0000-0000000000d2'), 0, 'M2 streak: the most recent week failed (1 of 3 is under half)');
select is(public.groups_streak('d3600000-0000-0000-0000-0000000000d3'), 0, 'M3 streak: no closed week is 0');
insert into public.group_weeks (group_id, week_start, closed_at, commitment_name, target_per_week, requires_photo, members_counted, members_complied)
values ('d3600000-0000-0000-0000-0000000000d3', date '2026-08-03', now(), 'Gym', 1, false, 2, 1), ('d3600000-0000-0000-0000-0000000000d3', date '2026-08-10', now(), 'Gym', 1, false, 0, 0);
select is(public.groups_streak('d3600000-0000-0000-0000-0000000000d3'), 1, 'M4 streak: exactly half complying counts as a good week and a newer zero week is skipped');
-- who may call it
set local role authenticated;
select throws_ok($$ select public.close_due_group_weeks() $$, '42501', null, 'M5 authenticated cannot close weeks');
reset role;
set local role anon;
select throws_ok($$ select public.close_due_group_weeks() $$, '42501', null, 'M6 anon cannot close weeks');
reset role;
-- the time-zone run: 2026-11-22 23:59:59 in Santiago. Monday 2026-11-23 16:00 in Auckland, so only Auckland's week 11-16 has ended.
set local role service_role;
insert into t_close select 't1', public.close_due_group_weeks(timestamptz '2026-11-23 00:00:00 America/Santiago' - interval '1 second');
reset role;
select is((select count(*)::int from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c5'), 1, 'N1 Santiago group at 23:59:59 on Sunday: only the week of the 9th is closed');
select is((select count(*)::int from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c6'), 2, 'N2 Auckland group at the same instant: both weeks are closed (its Sunday is over)');
select is((select array_agg(week_start order by week_start) from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c1'),
  array[date '2026-10-26', date '2026-11-02', date '2026-11-09'], 'N3 a week in progress is not closed (Gc: 10-26, 11-02, 11-09)');
select is((select n from t_close where k = 't1'), 3 + 3 + 3 + 1 + 2, 'N4 the function returns the number of weeks closed (Gc 3, Gq 3, Gp 3, Gz 1, Ga 2)');
select is((select count(*)::int from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c4'), 0, 'N5 an archived group is never closed');
set local role service_role;
insert into t_close select 't2', public.close_due_group_weeks(timestamptz '2026-11-23 00:00:00 America/Santiago');
reset role;
select is((select count(*)::int from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c5'), 2, 'N6 at Santiago''s midnight the Santiago group closes its week');
select is((select count(*)::int from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c3'), 3, 'N7 a photo week whose last photo is 12 hours old is not closed yet');
select is((select n from t_close where k = 't2'), 1 + 1 + 0 + 1 + 0, 'N8 the second run closes Gc, Gq and Gz weeks');
set local role service_role;
insert into t_close select 't3', public.close_due_group_weeks(timestamptz '2026-11-25 15:00:00 America/Santiago');
reset role;
select is((select n from t_close where k = 't3'), 1, 'N9 once the photo is more than 24 hours old the week closes');
select is((select count(*)::int from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c3'), 4, 'N10 Gp has its four weeks');
-- idempotent
create temp table t_snap as select md5(string_agg(row(w.*)::text, '|' order by w.group_id, w.week_start)) w,
  (select md5(string_agg(row(r.*)::text, '|' order by r.group_id, r.week_start, r.user_id)) from public.group_week_results r) r from public.group_weeks w;
set local role service_role;
select is(public.close_due_group_weeks(timestamptz '2026-11-25 15:00:00 America/Santiago'), 0, 'N11 a second run closes nothing');
reset role;
select is((select md5(string_agg(row(w.*)::text, '|' order by w.group_id, w.week_start)) from public.group_weeks w), (select w from t_snap), 'N12 and changes no week row');
select is((select md5(string_agg(row(r.*)::text, '|' order by r.group_id, r.week_start, r.user_id)) from public.group_week_results r), (select r from t_snap), 'N13 nor any result row');
-- exact results of Gc
select is((select array_agg(row(week_start, commitment_name, target_per_week, requires_photo, members_counted, members_complied)::text order by week_start)
  from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c1'),
  array[row(date '2026-10-26', 'Gym', 3, false, 0, 0)::text, row(date '2026-11-02', 'Gym', 3, false, 3, 2)::text,
        row(date '2026-11-09', 'Gym', 3, false, 3, 2)::text, row(date '2026-11-16', 'Gym', 3, false, 3, 2)::text],
  'N14 Gc snapshots: the empty first week is closed, joiners count from the next Monday, a leaver of that week is not counted in the snapshot, a removed member is not');
select is((select array_agg(row(week_start, user_id, done, target, complied, counted)::text order by week_start, user_id)
  from public.group_week_results where group_id = 'd3600000-0000-0000-0000-0000000000c1'),
  array[row(date '2026-11-02', tests.u(101), 3, 3, true, true)::text, row(date '2026-11-02', tests.u(102), 2, 3, false, true)::text, row(date '2026-11-02', tests.u(104), 3, 3, true, true)::text,
        row(date '2026-11-09', tests.u(101), 3, 3, true, true)::text, row(date '2026-11-09', tests.u(102), 3, 3, true, true)::text,
        row(date '2026-11-09', tests.u(103), 1, 3, false, true)::text, row(date '2026-11-09', tests.u(104), 1, 3, false, false)::text,
        row(date '2026-11-16', tests.u(101), 3, 3, true, true)::text, row(date '2026-11-16', tests.u(102), 0, 3, false, true)::text, row(date '2026-11-16', tests.u(103), 3, 3, true, true)::text],
  'N15 Gc results are exact: a leaver keeps a row with counted = false and only the check-ins up to the day they left (the one of the 13th is ignored); other habits, pre-joined weeks and a rejected check-in are ignored');
select is((select count(*)::int from public.notifications where type = 'group_week_closed' and payload ->> 'group_id' = 'd3600000-0000-0000-0000-0000000000c1'), 5,
  'Q1 group_week_closed: one per counted member who is still active and alive, once per closed week (1 + 2 + 2)');
select is((select array_agg(user_id order by user_id) from public.notifications where type = 'group_week_closed' and payload ->> 'group_id' = 'd3600000-0000-0000-0000-0000000000c1'),
  array[tests.u(101), tests.u(101), tests.u(101), tests.u(103), tests.u(103)], 'Q2 (members_counted 3 in the payload) not to the member who left (104), not to the deleted account (102), not to the removed one (105)');
select is((select n.payload from public.notifications n where n.type = 'group_week_closed' and n.user_id = tests.u(103) and n.payload ->> 'week_start' = '2026-11-09'),
  jsonb_build_object('group_id', 'd3600000-0000-0000-0000-0000000000c1', 'group_name', 'Cierre', 'week_start', '2026-11-09', 'complied', false, 'members_complied', 2, 'members_counted', 3),
  'Q3 the payload carries exactly the six keys with that member''s own result');
select is((select count(*)::int from public.notifications where type = 'group_week_closed' and payload ->> 'group_id' = 'd3600000-0000-0000-0000-0000000000c1'), 5,
  'Q4 the re-run of the closing function inserted no second notification');
select is(public.groups_streak('d3600000-0000-0000-0000-0000000000c1'), 3, 'N16 Gc streak counts its three good weeks');
select is((select array_agg(row(week_start, target_per_week, members_counted, members_complied)::text order by week_start)
  from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c2'),
  array[row(date '2026-10-26', 3, 0, 0)::text, row(date '2026-11-02', 3, 1, 1)::text, row(date '2026-11-09', 2, 1, 1)::text, row(date '2026-11-16', 2, 1, 1)::text],
  'N17 a pending commitment change applies from its Monday only: earlier snapshots keep the old target, never rewritten');
select is((select row(commitment_name, target_per_week, next_commitment_name, next_effective_from)::text from public.groups where id = 'd3600000-0000-0000-0000-0000000000c2'),
  row('Gym 2', 2, null::text, null::date)::text, 'N18 the change became the current commitment and the pending fields cleared');
select is((select row(target_per_week, next_target_per_week, next_effective_from)::text from public.groups where id = 'd3600000-0000-0000-0000-0000000000c1'),
  row(3, 5, date '2026-12-07')::text, 'N19 a pending change whose Monday has not arrived stays pending');
select is((select array_agg(row(week_start, done, complied)::text order by week_start, user_id) from public.group_week_results where group_id = 'd3600000-0000-0000-0000-0000000000c3'),
  array[row(date '2026-11-02', 0, false)::text, row(date '2026-11-02', 0, false)::text,
        row(date '2026-11-09', 2, true)::text, row(date '2026-11-09', 1, false)::text,
        row(date '2026-11-16', 1, false)::text, row(date '2026-11-16', 0, false)::text],
  'N20 a photo commitment counts only non-rejected check-ins with a photo');
select is((select members_counted from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c5' and week_start = date '2026-11-09'), 1, 'N21 a week with its member counts');
select is((select members_counted from public.group_weeks where group_id = 'd3600000-0000-0000-0000-0000000000c3' and week_start = date '2026-10-26'), 0, 'N22 a week with zero counted members is still closed');
-- reads of the closed weeks
set local role authenticated;
select tests.login(101);
select is((select array_agg(row(week_start, target_per_week, requires_photo, members_counted, members_complied, my_complied)::text order by ord)
  from (select h.*, row_number() over () ord from public.group_history('d3600000-0000-0000-0000-0000000000c1') h) h),
  array[row(date '2026-11-16', 3, false, 3, 2, true)::text, row(date '2026-11-09', 3, false, 3, 2, true)::text,
        row(date '2026-11-02', 3, false, 3, 2, true)::text, row(date '2026-10-26', 3, false, 0, 0, null::boolean)::text],
  'O1 group_history lists closed weeks newest first with my own result');
select is((select count(*)::int from public.group_history('d3600000-0000-0000-0000-0000000000c1', 2)), 2, 'O2 group_history honours the limit');
select is((select count(*)::int from public.group_history('d3600000-0000-0000-0000-0000000000c1', 0)), 1, 'O3 a limit of 0 is clamped to 1');
select is((select count(*)::int from public.group_history('d3600000-0000-0000-0000-0000000000c1', -9)), 1, 'O4 a negative limit is clamped to 1');
select is((select count(*)::int from public.group_history('d3600000-0000-0000-0000-0000000000c1', 100000)), 4, 'O5 a huge limit is clamped');
select is((select count(*)::int from public.group_history('d3600000-0000-0000-0000-0000000000c1', null)), 4, 'O6 a null limit means 12');
select is((select array_agg(k order by k)::text from jsonb_object_keys((select to_jsonb(h) from public.group_history('d3600000-0000-0000-0000-0000000000c1') h limit 1)) k),
  '{members_complied,members_counted,my_complied,requires_photo,target_per_week,week_start}', 'O7 group_history returns only the listed fields');
select is((select array_agg(row(username, done, target, complied)::text order by username) from public.group_week_detail('d3600000-0000-0000-0000-0000000000c1', date '2026-11-09')),
  array[row('g36_101', 3, 3, true)::text, row('g36_102', 3, 3, true)::text, row('g36_103', 1, 3, false)::text],
  'O8 group_week_detail lists the counted members only: the member who left during that week is not there');
select is((select count(*)::int from public.group_week_detail('d3600000-0000-0000-0000-0000000000c1', date '2026-11-10')), 0, 'O9 a date that is not a closed week''s start has no detail');
select is((select array_agg(k order by k)::text from jsonb_object_keys((select to_jsonb(d) from public.group_week_detail('d3600000-0000-0000-0000-0000000000c1', date '2026-11-09') d limit 1)) k),
  '{avatar_path,avatar_preset,complied,display_name,done,target,user_id,username}', 'O10 group_week_detail returns only the listed fields');
select tests.login(105);
select throws_ok($$ select * from public.group_history('d3600000-0000-0000-0000-0000000000c1') $$, 'P0001', 'group_not_found', 'O11 a removed member cannot read the history');
reset role;

-- ===================================================== P. account deletion
-- Gd1: 151 admin, 152 and 153 members. Gd2: 154 alone. Gd3: 155 and 156 admins, 157 member. 158 is a member of Gd1 and Gd3.
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by) values
  ('d3600000-0000-0000-0000-0000000000e1', 'Baja 1', 'barbell', 'salvia', 'Gym', 'barbell', 3, false, 'America/Santiago', tests.u(151)),
  ('d3600000-0000-0000-0000-0000000000e2', 'Baja 2', 'barbell', 'salvia', 'Gym', 'barbell', 3, false, 'America/Santiago', tests.u(154)),
  ('d3600000-0000-0000-0000-0000000000e3', 'Baja 3', 'barbell', 'salvia', 'Gym', 'barbell', 3, false, 'America/Santiago', tests.u(155));
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from) values
  ('d3600000-0000-0000-0000-0000000000e1', tests.u(151), 'admin', tests.h(151, 1), now() - interval '10 days', tests.today() - 10, tests.today() + 7),
  ('d3600000-0000-0000-0000-0000000000e1', tests.u(153), 'member', tests.h(153, 1), now() - interval '8 days', tests.today() - 8, tests.today() + 7),
  ('d3600000-0000-0000-0000-0000000000e1', tests.u(152), 'member', tests.h(152, 1), now() - interval '9 days', tests.today() - 9, tests.today() + 7),
  ('d3600000-0000-0000-0000-0000000000e1', tests.u(158), 'member', tests.h(158, 1), now() - interval '7 days', tests.today() - 7, tests.today() + 7),
  ('d3600000-0000-0000-0000-0000000000e2', tests.u(154), 'admin', tests.h(154, 1), now() - interval '10 days', tests.today() - 10, tests.today() + 7),
  ('d3600000-0000-0000-0000-0000000000e3', tests.u(155), 'admin', tests.h(155, 1), now() - interval '10 days', tests.today() - 10, tests.today() + 7),
  ('d3600000-0000-0000-0000-0000000000e3', tests.u(156), 'admin', tests.h(156, 1), now() - interval '9 days', tests.today() - 9, tests.today() + 7),
  ('d3600000-0000-0000-0000-0000000000e3', tests.u(157), 'member', tests.h(157, 1), now() - interval '8 days', tests.today() - 8, tests.today() + 7),
  ('d3600000-0000-0000-0000-0000000000e3', tests.u(158), 'member', tests.h(158, 2), now() - interval '7 days', tests.today() - 7, tests.today() + 7);
-- the service role deletes the habits first (delete-account.ts), then scrubs the profile
set local role service_role;
select lives_ok($$ delete from public.habits where id = tests.h(153, 1) $$, 'P1 the service role may delete a linked habit (the link is cleared, account deletion goes on)');
reset role;
select is((select habit_id from public.group_members where group_id = 'd3600000-0000-0000-0000-0000000000e1' and user_id = tests.u(153)), null, 'P2 the link to the deleted habit is cleared');
update public.profiles set deleted_at = now() where id = tests.u(151);
select is((select row(left_reason, is_live, left_at is not null)::text from public.group_members where group_id = 'd3600000-0000-0000-0000-0000000000e1' and user_id = tests.u(151)),
  row('account_deleted', false, true)::text, 'P3 deleting an account ends its memberships');
select is((select role from public.group_members where group_id = 'd3600000-0000-0000-0000-0000000000e1' and user_id = tests.u(152)), 'admin',
  'P4 the only admin''s group goes to the longest-standing remaining member');
select is((select count(*)::int from public.group_members where group_id = 'd3600000-0000-0000-0000-0000000000e1' and role = 'admin' and left_at is null), 1, 'P5 and there is exactly one admin');
update public.profiles set deleted_at = now() where id = tests.u(154);
select isnt((select archived_at from public.groups where id = 'd3600000-0000-0000-0000-0000000000e2'), null, 'P6 a group left with no members is archived');
update public.profiles set deleted_at = now() where id = tests.u(155);
select is((select array_agg(role order by user_id) from public.group_members where group_id = 'd3600000-0000-0000-0000-0000000000e3' and left_at is null),
  array['admin', 'member', 'member'], 'P7 when another admin remains nobody is promoted');
select is((select archived_at from public.groups where id = 'd3600000-0000-0000-0000-0000000000e3'), null, 'P8 and the group stays active');
update public.profiles set deleted_at = now() where id = tests.u(158);
select is((select count(*)::int from public.group_members where user_id = tests.u(158) and left_at is null), 0, 'P9 every membership of a deleted account ends');
select is((select count(*)::int from public.group_members where user_id = tests.u(158)), 2, 'P10 and the rows stay as history');
update public.profiles set deleted_at = now() where id = tests.u(104);
select is((select count(*)::int from public.group_week_results r where r.user_id = tests.u(104)), 2, 'P11 results of earlier weeks stay when the account is deleted');

-- ===================================================== R. frozen archived group and the visibility audit (C1)
-- 161 admin, 162 and 163 members of 'gf'; 164 admin, 165 and 166 members of the live group 'gl'.
set local role authenticated;
select tests.login(161);
select tests.save('gf', public.create_group('Congelado', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(161, 1)));
insert into t_codes select 'codef', public.create_group_invite(tests.g('gf'));
select tests.login(162);
select public.join_group((select code from t_codes where k = 'codef'), tests.h(162, 1));
select tests.login(163);
select public.join_group((select code from t_codes where k = 'codef'), tests.h(163, 1));
select tests.login(164);
select tests.save('gl', public.create_group('Vivo', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(164, 1)));
insert into t_codes select 'codel', public.create_group_invite(tests.g('gl'));
select tests.login(165);
select public.join_group((select code from t_codes where k = 'codel'), tests.h(165, 1));
select tests.login(166);
select public.join_group((select code from t_codes where k = 'codel'), tests.h(166, 1));
reset role;
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at) values
  (tests.c(162, 1), tests.h(162, 1), tests.u(162), tests.today(), tests.p(162, 1), now() - interval '1 minute'),
  (tests.c(165, 1), tests.h(165, 1), tests.u(165), tests.today(), tests.p(165, 1), now() - interval '1 minute');
insert into storage.objects (bucket_id, name) values ('proofs', tests.p(162, 1)), ('proofs', tests.p(165, 1));
set local role authenticated;
select tests.login(161);
select is((select count(*)::int from public.group_wall(tests.g('gf'))), 1, 'R1 before archiving the wall shows the check-in');
select is((select done from public.group_board(tests.g('gf')) where user_id = tests.u(162)), 1, 'R2 and the board counts it');
select is((select count(*)::int from storage.objects where name = tests.p(162, 1)), 1, 'R3 and the fellow member reads the photo');
select public.archive_group(tests.g('gf'));
reset role;
-- after archiving: 162 checks in for tomorrow (created just before), 163 checks in today but CREATED after the archive
insert into public.checkins (id, habit_id, user_id, local_date, created_at) values
  (tests.c(162, 2), tests.h(162, 1), tests.u(162), tests.today() + 1, now() - interval '30 seconds'),
  (tests.c(163, 1), tests.h(163, 1), tests.u(163), tests.today(), now() + interval '1 minute');
set local role authenticated;
select tests.login(161);
select is((select array_agg(checkin_id) from public.group_wall(tests.g('gf'))), array[tests.c(162, 1)],
  'R4 an archived group''s wall is frozen: nothing created after archiving (163) and nothing dated after the archive day (162) appears');
select is((select array_agg(row(user_id, done)::text order by user_id) from public.group_board(tests.g('gf'))),
  array[row(tests.u(161), 0)::text, row(tests.u(162), 1)::text, row(tests.u(163), 0)::text], 'R5 the board of an archived group is frozen too');
select tests.login(163);
select is((select my_done from public.my_groups() where id = tests.g('gf')), 0, 'R6 my_groups is frozen: 163''s later check-in does not count');
select tests.login(162);
select is((select my_done from public.my_groups() where id = tests.g('gf')), 1, 'R7 and 162''s earlier one does');
select tests.login(161);
select is((select count(*)::int from storage.objects where name = tests.p(162, 1)), 0, 'R8 an archived group no longer opens photos');
reset role;
update public.habits set visibility = 'private' where id = tests.h(162, 1);
set local role authenticated;
select tests.login(161);
select is((select count(*)::int from public.group_wall(tests.g('gf'))), 0, 'R9 once the habit turns private the archived wall shows none of it');
select is((select done from public.group_board(tests.g('gf')) where user_id = tests.u(162)), 0, 'R10 and the board shows 0');
select is((select count(*)::int from public.group_detail(tests.g('gf')) where archived_at is not null and member_count = 3), 1, 'R11 group_detail of an archived group');
-- a live group: the habit turns private behind the guard's back (service paths), then is unlinked, then the member leaves
select tests.login(164);
select is((select count(*)::int from public.group_wall(tests.g('gl'))), 1, 'R12 live group: the wall shows 165''s check-in');
select is((select count(*)::int from storage.objects where name = tests.p(165, 1)), 1, 'R12b and the photo opens');
reset role;
update public.habits set visibility = 'private' where id = tests.h(165, 1);
set local role authenticated;
select tests.login(164);
select is((select count(*)::int from public.group_wall(tests.g('gl'))), 0, 'R13 a habit that turned private disappears from the wall');
select is((select done from public.group_board(tests.g('gl')) where user_id = tests.u(165)), 0, 'R14 from the board');
select is((select count(*)::int from storage.objects where name = tests.p(165, 1)), 0, 'R15 and its photos stop opening');
reset role;
update public.habits set visibility = 'friends' where id = tests.h(165, 1);
update public.group_members set habit_id = null where group_id = tests.g('gl') and user_id = tests.u(165);
set local role authenticated;
select tests.login(164);
select is((select count(*)::int from public.group_wall(tests.g('gl'))), 0, 'R16 an unlinked member shows nothing on the wall');
select is((select done from public.group_board(tests.g('gl')) where user_id = tests.u(165)), 0, 'R17 nor on the board');
select tests.login(165);
select is((select my_habit_id from public.my_groups() where id = tests.g('gl')), null, 'R17b my_groups answers a null my_habit_id');
select tests.login(166);
select public.leave_group(tests.g('gl'));
reset role;
insert into public.checkins (id, habit_id, user_id, local_date, photo_path) values (tests.c(166, 1), tests.h(166, 1), tests.u(166), tests.today(), tests.p(166, 1));
insert into storage.objects (bucket_id, name) values ('proofs', tests.p(166, 1));
set local role authenticated;
select tests.login(164);
select is((select count(*)::int from public.group_wall(tests.g('gl')) where user_id = tests.u(166)), 0, 'R18 a check-in made after leaving never appears');
select is((select count(*)::int from storage.objects where name = tests.p(166, 1)), 0, 'R19 nor does its photo open');

-- ===================================================== S. the commitment in effect today (m5)
reset role;
insert into public.groups (id, name, icon, color, commitment_name, commitment_icon, target_per_week, requires_photo, timezone, created_by, created_at,
                           next_commitment_name, next_commitment_icon, next_target_per_week, next_requires_photo, next_effective_from) values
  ('d3600000-0000-0000-0000-0000000000f1', 'Pend A', 'barbell', 'salvia', 'Viejo', 'barbell', 2, false, 'America/Santiago', tests.u(167), now() - interval '30 days',
   'Nuevo', 'target', 5, false, tests.wk()),
  ('d3600000-0000-0000-0000-0000000000f2', 'Pend B', 'barbell', 'salvia', 'Viejo', 'barbell', 2, false, 'America/Santiago', tests.u(168), now() - interval '30 days',
   'Nuevo', 'target', 5, false, tests.wk());
insert into public.group_members (group_id, user_id, role, habit_id, joined_at, joined_on, counts_from) values
  ('d3600000-0000-0000-0000-0000000000f1', tests.u(167), 'admin', tests.h(167, 1), now() - interval '30 days', tests.today() - 30, public.groups_counts_from(tests.today() - 30)),
  ('d3600000-0000-0000-0000-0000000000f2', tests.u(168), 'admin', tests.h(168, 1), now() - interval '30 days', tests.today() - 30, public.groups_counts_from(tests.today() - 30));
insert into public.group_weeks (group_id, week_start, closed_at, commitment_name, target_per_week, requires_photo, members_counted, members_complied)
values ('d3600000-0000-0000-0000-0000000000f1', tests.wk() - 7, now(), 'Viejo', 2, false, 1, 0);
set local role authenticated;
select tests.login(168);
select is((select row(commitment_name, target_per_week, next_commitment_name, next_effective_from)::text from public.group_detail('d3600000-0000-0000-0000-0000000000f2')),
  row('Nuevo', 5, null::text, null::date)::text, 'S1 group_detail shows the commitment in effect today even if the close function has not run');
select is((select target from public.group_board('d3600000-0000-0000-0000-0000000000f2') limit 1), 5, 'S2 so does the board');
select is((select target_per_week from public.my_groups() where id = 'd3600000-0000-0000-0000-0000000000f2'), 5, 'S3 and my_groups');
select throws_ok($$ select public.set_group_commitment('d3600000-0000-0000-0000-0000000000f2', 'Otro', 'barbell', 3, false) $$, 'P0001', 'commitment_change_pending',
  'S4 a due change that cannot be applied yet (the week before is open) is never silently replaced');
select tests.login(167);
select public.set_group_commitment('d3600000-0000-0000-0000-0000000000f1', 'Otro', 'barbell', 3, false);
select is((select row(commitment_name, target_per_week, next_commitment_name, next_target_per_week)::text from public.group_detail('d3600000-0000-0000-0000-0000000000f1')),
  row('Nuevo', 5, 'Otro', 3)::text, 'S5 a due change is applied first, then the new one is stored as pending');

select * from finish();
rollback;
