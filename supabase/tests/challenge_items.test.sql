begin;
-- Sub-retos (challenge_items): tables, RLS, seed + mirror triggers, next_item_start, the re-pointed guards,
-- reject_checkin, respond_challenge (4 params), add / respond / withdraw item, cascades.
-- supabase/seed.sql loads local test users; this file builds its own fixtures inside this transaction, so clear
-- the seed first (rolled back at the end).
truncate public.profiles cascade;
delete from auth.users where email like '%@example.com';
create extension if not exists pgtap with schema extensions;
select plan(160);

-- ------------------------------------------------------------------ helpers
-- ids are derived from small numbers: tests.u(n) user, tests.h(n, k) habit k of user n, tests.c(s) challenge,
-- tests.i(s, p) item p of challenge s, tests.e(n) checkins / entries.
create schema tests;
grant usage on schema tests to authenticated;
create function tests.u(n int) returns uuid language sql immutable as
  $f$ select ('a1e00000-0000-0000-0000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid $f$;
create function tests.h(n int, k int) returns uuid language sql immutable as
  $f$ select ('b1e00000-0000-0000-' || lpad(to_hex(n), 2, '0') || '00-00000000000' || to_hex(k))::uuid $f$;
create function tests.c(s int) returns uuid language sql immutable as
  $f$ select ('c1e00000-0000-0000-0000-0000000000' || lpad(to_hex(s), 2, '0'))::uuid $f$;
create function tests.i(s int, p int) returns uuid language sql immutable as
  $f$ select ('d1e00000-0000-0000-' || lpad(to_hex(s), 2, '0') || '00-00000000000' || to_hex(p))::uuid $f$;
create function tests.e(n int) returns uuid language sql immutable as
  $f$ select ('e1e00000-0000-0000-0000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid $f$;
create function tests.today() returns date language sql stable as $f$ select (now() at time zone 'UTC')::date $f$;
-- the id of item at a position (bypasses RLS: for building SQL only)
create function tests.item(s int, p int) returns uuid language sql stable security definer set search_path = '' as
  $f$ select i.id from public.challenge_items i where i.challenge_id = tests.c(s) and i.position = p $f$;
-- act as user n (authenticated) / count the rows of a query
create function tests.act(n int) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', tests.u(n), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$f$;
create function tests.n(q text) returns int language plpgsql as $f$
declare v int;
begin
  execute 'select count(*)::int from (' || q || ') s' into v;
  return v;
end;
$f$;
-- fixtures built as postgres (clients cannot set ids / status): a challenge (creator habit k = p_ch, rival habit k = p_rh)
-- and an extra item. The seed trigger gives every challenge its item #1.
create function tests.mk_challenge(p_s int, p_cu int, p_ru int, p_status text, p_freq text, p_weeks int, p_starts date, p_ch int, p_rh int)
returns void language plpgsql as $f$
begin
  insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                                 requires_photo, weeks, fine_amount, timezone, status, starts_on)
  select tests.c(p_s), tests.u(p_cu), tests.u(p_ru), h.id, case when p_rh is null then null else tests.h(p_ru, p_rh) end,
         p_freq, case when p_freq = 'weekly' then 3 end, h.requires_photo, p_weeks, 1000, 'UTC', p_status, p_starts
  from public.habits h where h.id = tests.h(p_cu, p_ch);
end;
$f$;
create function tests.mk_item(p_s int, p_pos int, p_status text, p_cu int, p_ck int, p_ru int, p_rk int, p_by int,
                              p_starts date default null, p_photo boolean default false, p_target int default null)
returns void language plpgsql as $f$
begin
  insert into public.challenge_items (id, challenge_id, position, creator_habit_id, rival_habit_id, target_per_week, requires_photo,
                                      status, proposed_by, starts_on, accepted_at)
  values (tests.i(p_s, p_pos), tests.c(p_s), p_pos,
          case when p_ck is null then null else tests.h(p_cu, p_ck) end,
          case when p_rk is null then null else tests.h(p_ru, p_rk) end,
          p_target, p_photo, p_status, tests.u(p_by), p_starts, case when p_status = 'active' then now() end);
end;
$f$;
grant execute on all functions in schema tests to authenticated;

-- ------------------------------------------------------------------ people and habits
-- pairs of friends: (1,2) (3,4) ... (29,30); 31 is a stranger to everyone
insert into auth.users (id) select tests.u(n) from generate_series(1, 32) n;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
  select tests.u(n), 'ci_' || n, 'U' || n, 'Test', '1990-01-01', now(), 'UTC' from generate_series(1, 32) n;
insert into public.friendships (requester_id, addressee_id, status)
  select tests.u(n), tests.u(n + 1), 'accepted' from generate_series(1, 29, 2) n;
-- k=1..4 plain, 5 photo, 6 private, 7 archived
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility, archived_at)
  select tests.h(n, k), tests.u(n), 'H' || n || '-' || k, 'book', 'daily', k = 5,
         case when k = 6 then 'private' else 'friends' end, case when k = 7 then now() end
  from generate_series(1, 32) n, generate_series(1, 7) k;
-- extra habits of the guards scenario (users 9 and 10): 8 photo, 9 quantity, 11 plain, 12 plain
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility) values
  (tests.h(9, 8), tests.u(9), 'foto 9', 'book', 'daily', true, 'friends'),
  (tests.h(10, 8), tests.u(10), 'foto 10', 'book', 'daily', true, 'friends'),
  (tests.h(9, 11), tests.u(9), 'plano 9', 'book', 'daily', false, 'friends'),
  (tests.h(10, 11), tests.u(10), 'plano 10', 'book', 'daily', false, 'friends'),
  (tests.h(9, 12), tests.u(9), 'plano 9b', 'book', 'daily', false, 'friends');
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, log_type, quantity_unit, quantity_target, quantity_step) values
  (tests.h(9, 9), tests.u(9), 'agua 9', 'drop', 'daily', 'friends', 'quantity', 'ml', 2000, 250),
  (tests.h(10, 9), tests.u(10), 'agua 10', 'drop', 'daily', 'friends', 'quantity', 'ml', 2000, 250);

-- ============================================================ 1.1 tables, RLS, grants, indexes
select tests.mk_challenge(1, 1, 2, 'active', 'daily', 4, tests.today() - 2, 1, 1);
insert into public.challenge_item_results (challenge_id, period_start, item_id, player_id, met, done, needed)
  values (tests.c(1), tests.today() - 2, tests.item(1, 1), tests.u(1), false, 0, 1);

select has_table('public', 'challenge_items', 'challenge_items exists');
select has_table('public', 'challenge_item_results', 'challenge_item_results exists');
select ok((select bool_and(relrowsecurity) from pg_class
           where oid = any(array['public.challenge_items'::regclass, 'public.challenge_item_results'::regclass])),
  'RLS is enabled on both tables');

select tests.act(1);
select is(tests.n($$ select 1 from public.challenge_items $$), 1, 'a participant reads the items');
select is(tests.n($$ select 1 from public.challenge_item_results $$), 1, 'a participant reads the item results');
select tests.act(31);
select is(tests.n($$ select 1 from public.challenge_items $$), 0, 'a stranger reads no items');
select is(tests.n($$ select 1 from public.challenge_item_results $$), 0, 'a stranger reads no item results');
select tests.act(1);
select throws_ok($$ insert into public.challenge_items (challenge_id, position, creator_habit_id, status, proposed_by)
  values (tests.c(1), 9, tests.h(1, 2), 'proposed', tests.u(1)) $$, '42501', null, 'a client cannot insert items');
select throws_ok($$ update public.challenge_items set requires_photo = true $$, '42501', null, 'a client cannot update items');
select throws_ok($$ delete from public.challenge_items $$, '42501', null, 'a client cannot delete items');
select throws_ok($$ insert into public.challenge_item_results (challenge_id, period_start, item_id, player_id, met, done, needed)
  values (tests.c(1), tests.today(), tests.item(1, 1), tests.u(1), true, 1, 1) $$, '42501', null, 'a client cannot insert results');
select throws_ok($$ update public.challenge_item_results set met = true $$, '42501', null, 'a client cannot update results');
select throws_ok($$ delete from public.challenge_item_results $$, '42501', null, 'a client cannot delete results');
reset role;

-- a habit is in at most one LIVE item per side of a challenge; a withdrawn item frees it
select throws_ok($$ insert into public.challenge_items (challenge_id, position, creator_habit_id, status, proposed_by)
  values (tests.c(1), 2, tests.h(1, 1), 'proposed', tests.u(1)) $$, '23505', null, 'the creator habit cannot be in two live items');
select throws_ok($$ insert into public.challenge_items (challenge_id, position, creator_habit_id, rival_habit_id, status, proposed_by)
  values (tests.c(1), 2, tests.h(1, 2), tests.h(2, 1), 'proposed', tests.u(1)) $$, '23505', null, 'the rival habit cannot be in two live items');
select lives_ok($$ insert into public.challenge_items (challenge_id, position, creator_habit_id, status, proposed_by)
  values (tests.c(1), 2, tests.h(1, 2), 'proposed', tests.u(1)) $$, 'a free habit can be added');
update public.challenge_items set status = 'withdrawn' where challenge_id = tests.c(1) and position = 2;
select lives_ok($$ insert into public.challenge_items (challenge_id, position, creator_habit_id, status, proposed_by)
  values (tests.c(1), 3, tests.h(1, 2), 'proposed', tests.u(1)) $$, 'after a withdrawal the habit can be used again');
select throws_ok($$ insert into public.challenge_items (challenge_id, position, creator_habit_id, rival_habit_id, status, proposed_by)
  values (tests.c(1), 4, tests.h(1, 3), tests.h(2, 3), 'active', tests.u(1)) $$, '23514', null, 'an active item needs a start date');
select throws_ok($$ insert into public.challenge_items (challenge_id, position, status, proposed_by)
  values (tests.c(1), 4, 'proposed', tests.u(1)) $$, '23514', null, 'an item needs at least one habit');
select has_trigger('public', 'challenge_items', 'challenge_items_forbid_deleted_actor', 'items refuse a deleted actor');
select has_trigger('public', 'challenge_item_results', 'challenge_item_results_forbid_deleted_actor', 'results refuse a deleted actor');
delete from public.challenge_item_results;

-- ============================================================ 1.2 seed trigger and backfill
select tests.act(3);
select lives_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values (tests.u(3), tests.u(4), tests.h(3, 1), 'daily', null, false, 2, 1000, 'UTC') $$, 'a client proposes a challenge');
reset role;
select results_eq($$ select i.position::int, i.status, i.creator_habit_id, i.rival_habit_id, i.proposed_by, i.requires_photo, i.starts_on
    from public.challenge_items i join public.challenges c on c.id = i.challenge_id
    where c.creator_id = tests.u(3) and c.rival_id = tests.u(4) and c.status = 'proposed' $$,
  $$ values (1, 'proposed', tests.h(3, 1), null::uuid, tests.u(3), false, null::date) $$,
  'the new challenge gets exactly one proposed item mirroring its habit');
select tests.mk_challenge(2, 3, 4, 'declined', 'daily', 2, null, 2, null);
select tests.mk_challenge(3, 3, 4, 'cancelled', 'daily', 2, null, 3, null);
select tests.mk_challenge(4, 3, 4, 'finished', 'daily', 2, tests.today() - 20, 1, 1);
select is((select count(*)::int from public.challenge_items where challenge_id in (tests.c(2), tests.c(3), tests.c(4))), 3,
  'each direct challenge gets one item');
select results_eq($$ select status from public.challenge_items where challenge_id in (tests.c(2), tests.c(3), tests.c(4)) order by challenge_id $$,
  $$ values ('declined'), ('withdrawn'), ('active') $$, 'terminal states are mapped');
select is((select starts_on from public.challenge_items where challenge_id = tests.c(4)), tests.today() - 20,
  'a started challenge copies its start date to the item');
-- an active challenge without a start date (legacy fixtures) still holds its habits: the item is live, not active
select tests.mk_challenge(5, 31, 32, 'active', 'daily', 2, null, 1, 1);
select is((select status from public.challenge_items where challenge_id = tests.c(5)), 'proposed',
  'an active challenge without a start date gets a live proposed item');
delete from public.challenge_items where challenge_id in (select id from public.challenges where creator_id = tests.u(3));
select lives_ok($$ select public.challenge_items_seed(c) from public.challenges c
  where c.creator_id = tests.u(3) and not exists (select 1 from public.challenge_items i where i.challenge_id = c.id) $$,
  'the backfill runs');
select is((select count(*)::int from public.challenge_items i join public.challenges c on c.id = i.challenge_id where c.creator_id = tests.u(3)),
  (select count(*)::int from public.challenges where creator_id = tests.u(3)), 'one item per challenge after the backfill');
select lives_ok($$ select public.challenge_items_seed(c) from public.challenges c
  where c.creator_id = tests.u(3) and not exists (select 1 from public.challenge_items i where i.challenge_id = c.id) $$,
  'the backfill can run again');
select is((select count(*)::int from public.challenge_items i join public.challenges c on c.id = i.challenge_id where c.creator_id = tests.u(3)),
  (select count(*)::int from public.challenges where creator_id = tests.u(3)), 'and it adds nothing');

-- ============================================================ 1.3 sync triggers
select tests.mk_challenge(6, 5, 6, 'proposed', 'weekly', 4, null, 1, null);
update public.challenge_items set target_per_week = 5 where id = tests.item(6, 1);
select is((select target_per_week from public.challenges where id = tests.c(6)), 5, 'an item update reaches the legacy target');
update public.challenge_items set creator_habit_id = tests.h(5, 2) where id = tests.item(6, 1);
select is((select creator_habit_id from public.challenges where id = tests.c(6)), tests.h(5, 2), 'and the legacy habit');
select tests.mk_item(6, 2, 'proposed', 5, 3, null, null, 5, null, false, 2);
update public.challenge_items set status = 'withdrawn' where id = tests.item(6, 1);
select is((select creator_habit_id from public.challenges where id = tests.c(6)), tests.h(5, 3),
  'withdrawing the primary item moves the legacy habit to the next one');
select is((select target_per_week from public.challenges where id = tests.c(6)), 2, 'and the legacy target');
update public.challenges set creator_habit_id = tests.h(5, 1), target_per_week = 4 where id = tests.c(6);
select results_eq($$ select creator_habit_id, target_per_week from public.challenge_items where id = tests.item(6, 2) $$,
  $$ values (tests.h(5, 1), 4) $$, 'a direct update of the challenge reaches the primary item');
update public.challenges set status = 'active', rival_habit_id = tests.h(6, 1), starts_on = tests.today() + 2 where id = tests.c(6);
select results_eq($$ select status, rival_habit_id, starts_on, accepted_at is not null from public.challenge_items where id = tests.item(6, 2) $$,
  $$ values ('active', tests.h(6, 1), tests.today() + 2, true) $$, 'proposed -> active activates the primary item');
select is((select status from public.challenge_items where id = tests.item(6, 1)), 'withdrawn', 'a withdrawn item stays withdrawn');
select tests.mk_item(6, 3, 'active', 5, 4, 6, 4, 5, tests.today() + 10);
update public.challenges set starts_on = tests.today() + 3 where id = tests.c(6);
select is((select starts_on from public.challenge_items where id = tests.item(6, 2)), tests.today() + 3,
  'items that started with the challenge follow a new start date');
select is((select starts_on from public.challenge_items where id = tests.item(6, 3)), tests.today() + 10, 'an item with its own start date does not');
select lives_ok($$ update public.challenges set creator_habit_id = creator_habit_id, target_per_week = target_per_week, starts_on = starts_on
  where id = tests.c(6) $$, 'the mirrors do not recurse');

-- ============================================================ 1.4 next_item_start
select tests.mk_challenge(7, 7, 8, 'finished', 'daily', 2, tests.today() - 3, 1, 1);
select tests.mk_challenge(8, 7, 8, 'finished', 'daily', 2, tests.today() + 5, 1, 1);
select tests.mk_challenge(9, 7, 8, 'finished', 'daily', 2, tests.today() - 13, 1, 1);
select tests.mk_challenge(10, 7, 8, 'finished', 'weekly', 4, tests.today() - 10, 1, 1);
select tests.mk_challenge(11, 7, 8, 'finished', 'weekly', 4, tests.today() + 1, 1, 1);
select tests.mk_challenge(12, 7, 8, 'finished', 'weekly', 4, tests.today(), 1, 1);
select tests.mk_challenge(13, 7, 8, 'finished', 'weekly', 4, tests.today() - 21, 1, 1);
select tests.mk_challenge(14, 7, 8, 'finished', 'weekly', 4, tests.today() + 14, 1, 1);
select is(public.next_item_start((select c from public.challenges c where c.id = tests.c(7))), tests.today() + 1, 'daily: tomorrow');
select is(public.next_item_start((select c from public.challenges c where c.id = tests.c(8))), tests.today() + 5, 'daily before the start: the start');
select is(public.next_item_start((select c from public.challenges c where c.id = tests.c(9))), null::date, 'daily: no period left');
select is(public.next_item_start((select c from public.challenges c where c.id = tests.c(10))), tests.today() - 10 + 14, 'weekly: the next period start');
select is(public.next_item_start((select c from public.challenges c where c.id = tests.c(11))), tests.today() + 1, 'weekly: the day before the start');
select is(public.next_item_start((select c from public.challenges c where c.id = tests.c(12))), tests.today() + 7, 'weekly: on the first day of period 1');
select is(public.next_item_start((select c from public.challenges c where c.id = tests.c(13))), null::date, 'weekly: no period left');
select is(public.next_item_start((select c from public.challenges c where c.id = tests.c(14))), tests.today() + 14, 'weekly before the start: the start');
select ok(not has_function_privilege('authenticated', 'public.next_item_start(public.challenges)', 'execute'), 'clients cannot call next_item_start');

-- ============================================================ 1.5 guards read items (habits only in items 2..7)
select tests.mk_challenge(15, 9, 10, 'active', 'daily', 4, tests.today() - 7, 1, 1);
select tests.mk_item(15, 2, 'active', 9, 2, 10, 2, 9, tests.today() - 3);
select tests.mk_item(15, 3, 'active', 9, 5, 10, 5, 9, tests.today(), true);
select tests.mk_item(15, 4, 'active', 9, 8, 10, 8, 9, tests.today(), true);
select tests.mk_item(15, 5, 'active', 9, 9, 10, 9, 9, tests.today() - 1);
select tests.mk_item(15, 6, 'active', 9, 11, 10, 11, 9, tests.today());
select tests.mk_item(15, 7, 'proposed', 9, 12, null, null, 9);
insert into public.challenge_periods (challenge_id, period_start, period_end, closed_at) values
  (tests.c(15), tests.today() - 7, tests.today() - 1, now()),
  (tests.c(15), tests.today(), tests.today() + 6, now());

select throws_ok($$ update public.habits set visibility = 'private' where id = tests.h(9, 12) $$,
  'P0001', 'habit_in_challenge', 'visibility guard: a habit of a PROPOSED item cannot go private');
select throws_ok($$ update public.habits set requires_photo = false where id = tests.h(9, 5) $$,
  'P0001', 'habit_in_challenge', 'photo guard: the photo requirement of an item habit stays');
select throws_ok($$ insert into public.habit_items (habit_id, user_id, label, position) values (tests.h(9, 8), tests.u(9), 'Paso', 0) $$,
  'P0001', 'habit_in_challenge', 'items guard: a photo item habit takes no steps');
select throws_ok($$ update public.habits set quantity_target = 1000 where id = tests.h(9, 9) $$,
  'P0001', 'habit_in_challenge', 'quantity guard: the goal of an item habit cannot go down');
select tests.act(9);
select throws_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = tests.h(9, 11) $$, 'P0001', 'habit_in_challenge', 'switch guard: an item habit cannot switch to quantity');
select is(public.habit_date_period_closed(tests.h(9, 2), tests.today() - 2), true, 'period closed: inside a closed period from the item start');
select is(public.habit_date_period_closed(tests.h(9, 2), tests.today() - 5), false, 'period closed: before the item start it is open');
select is(public.habit_date_period_closed(tests.h(9, 1), tests.today() - 5), true, 'period closed: item 1 locks from the challenge start');
select is(public.habit_date_period_closed(tests.h(9, 2), tests.today() + 30), false, 'period closed: no period, not closed');
-- remove_quantity_entry keeps the check-in of a closed period (habit only in item 5)
reset role;
insert into public.checkins (id, habit_id, user_id, local_date) values (tests.e(1), tests.h(9, 9), tests.u(9), tests.today());
insert into public.quantity_entries (id, user_id, habit_id, local_date, amount) values
  (tests.e(1), tests.u(9), tests.h(9, 9), tests.today(), 2000),
  (tests.e(2), tests.u(9), tests.h(9, 9), tests.today(), 100);
select tests.act(9);
select results_eq($$ select total, target, done from public.remove_quantity_entry(tests.e(1)) $$,
  $$ values (100::numeric, 2000::numeric, true) $$, 'remove_quantity_entry: in a closed period the check-in stays');
select is(tests.n($$ select 1 from public.checkins where habit_id = tests.h(9, 9) and local_date = tests.today() $$), 1, 'and it is still there');
reset role;
update public.challenge_items set starts_on = tests.today() + 1 where id = tests.i(15, 5);
select tests.act(9);
select results_eq($$ select total, target, done from public.remove_quantity_entry(tests.e(2)) $$,
  $$ values (0::numeric, 2000::numeric, false) $$, 'before the item starts the period is not closed for it');
select is(tests.n($$ select 1 from public.checkins where habit_id = tests.h(9, 9) and local_date = tests.today() $$), 0, 'so the check-in goes away');
-- released: item withdrawn / declined, challenge ended
reset role;
update public.challenge_items set status = 'withdrawn' where id = tests.i(15, 7);
select lives_ok($$ update public.habits set visibility = 'private' where id = tests.h(9, 12) $$, 'visibility guard: released when the item is withdrawn');
update public.challenge_items set status = 'declined' where id = tests.i(15, 4);
-- (a photo habit never takes steps: the error moves from habit_in_challenge to the habit's own photo_conflict)
select throws_ok($$ insert into public.habit_items (habit_id, user_id, label, position) values (tests.h(9, 8), tests.u(9), 'Paso', 0) $$,
  'P0001', 'photo_conflict', 'items guard: released when the item is declined');
update public.challenge_items set status = 'withdrawn' where id = tests.i(15, 6);
select tests.act(9);
select lives_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = tests.h(9, 11) $$, 'switch guard: released when the item is withdrawn');
reset role;
update public.challenge_items set status = 'withdrawn' where id = tests.i(15, 2);
select tests.act(9);
select is(public.habit_date_period_closed(tests.h(9, 2), tests.today() - 2), false, 'period closed: a withdrawn item locks nothing');
reset role;
update public.challenges set status = 'cancelled' where id = tests.c(15);
select lives_ok($$ update public.habits set requires_photo = false where id = tests.h(9, 5) $$, 'photo guard: released when the challenge is cancelled');
select lives_ok($$ update public.habits set quantity_target = 1000 where id = tests.h(9, 9) $$, 'quantity guard: released when the challenge is cancelled');

-- ============================================================ 1.6 reject_checkin reads items
select tests.mk_challenge(16, 11, 12, 'active', 'daily', 4, tests.today() - 10, 1, 1);
select tests.mk_item(16, 2, 'active', 11, 5, 12, 5, 11, tests.today() - 2, true);
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at) values
  (tests.e(11), tests.h(12, 5), tests.u(12), tests.today() - 1, tests.u(12)::text || '/' || tests.e(11)::text || '.jpg', now() - interval '1 hour'),
  (tests.e(12), tests.h(12, 5), tests.u(12), tests.today() - 5, tests.u(12)::text || '/' || tests.e(12)::text || '.jpg', now() - interval '1 hour'),
  (tests.e(13), tests.h(12, 1), tests.u(12), tests.today() - 1, tests.u(12)::text || '/' || tests.e(13)::text || '.jpg', now() - interval '1 hour');
select tests.act(11);
select throws_ok($$ select public.reject_checkin(tests.e(12), 'unclear') $$, 'P0001', 'checkin_out_of_range', 'a check-in before the item started');
select throws_ok($$ select public.reject_checkin(tests.e(13), 'unclear') $$, 'P0001', 'not_rival', 'a non-photo item cannot reject');
select lives_ok($$ select public.reject_checkin(tests.e(11), 'duplicate') $$, 'the rival rejects a photo of item 2');
reset role;
select ok((select rejected_at is not null and rejected_by = tests.u(11) from public.checkins where id = tests.e(11)), 'the rejection is recorded');
select is((select payload ->> 'item_id' from public.notifications where user_id = tests.u(12) and type = 'photo_rejected'),
  tests.i(16, 2)::text, 'the notification carries the item');

-- ============================================================ 1.7 respond_challenge (4 params)
select tests.mk_challenge(17, 13, 14, 'proposed', 'daily', 2, null, 1, null);
select tests.mk_item(17, 2, 'proposed', 13, 2, null, null, 13);
select tests.mk_item(17, 3, 'proposed', 13, 5, null, null, 13, null, true);
select tests.act(14);
select throws_ok($$ select public.respond_challenge(tests.c(17), true) $$, 'P0001', 'rival_habit_required', 'accepting needs habits');
select throws_ok($$ select public.respond_challenge(tests.c(17), true, null,
  jsonb_build_object(tests.item(17, 1)::text, tests.h(14, 1)::text, tests.item(17, 2)::text, tests.h(14, 2)::text)) $$,
  'P0001', 'rival_habit_required', 'every item needs a habit');
select throws_ok($$ select public.respond_challenge(tests.c(17), true, null, jsonb_build_object(
  tests.item(17, 1)::text, tests.h(13, 3)::text, tests.item(17, 2)::text, tests.h(14, 2)::text, tests.item(17, 3)::text, tests.h(14, 5)::text)) $$,
  'P0001', 'rival_habit_invalid', 'a habit of someone else is invalid');
select throws_ok($$ select public.respond_challenge(tests.c(17), true, null, jsonb_build_object(
  tests.item(17, 1)::text, tests.h(14, 6)::text, tests.item(17, 2)::text, tests.h(14, 2)::text, tests.item(17, 3)::text, tests.h(14, 5)::text)) $$,
  'P0001', 'rival_habit_invalid', 'a private habit is invalid');
select throws_ok($$ select public.respond_challenge(tests.c(17), true, null, jsonb_build_object(
  tests.item(17, 1)::text, tests.h(14, 7)::text, tests.item(17, 2)::text, tests.h(14, 2)::text, tests.item(17, 3)::text, tests.h(14, 5)::text)) $$,
  'P0001', 'rival_habit_invalid', 'an archived habit is invalid');
select throws_ok($$ select public.respond_challenge(tests.c(17), true, null, jsonb_build_object(
  tests.item(17, 1)::text, tests.h(14, 1)::text, tests.item(17, 2)::text, tests.h(14, 2)::text, tests.item(17, 3)::text, tests.h(14, 3)::text)) $$,
  'P0001', 'rival_habit_needs_photo', 'a photo item needs a photo habit');
select throws_ok($$ select public.respond_challenge(tests.c(17), true, null, jsonb_build_object(
  tests.item(17, 1)::text, tests.h(14, 1)::text, tests.item(17, 2)::text, tests.h(14, 1)::text, tests.item(17, 3)::text, tests.h(14, 5)::text)) $$,
  'P0001', 'rival_habit_duplicate', 'the same habit cannot answer two items');
select throws_ok($$ select public.respond_challenge(tests.c(17), true, null, jsonb_build_object(
  tests.item(17, 1)::text, tests.h(14, 1)::text, tests.item(17, 2)::text, tests.h(14, 2)::text, tests.item(17, 3)::text, tests.h(14, 5)::text,
  tests.i(99, 9)::text, tests.h(14, 4)::text)) $$, 'P0001', 'item_not_found', 'a key that is not an item of the challenge');
reset role;
update public.habits set archived_at = now() where id = tests.h(13, 2);
select tests.act(14);
select throws_ok($$ select public.respond_challenge(tests.c(17), true, null, jsonb_build_object(
  tests.item(17, 1)::text, tests.h(14, 1)::text, tests.item(17, 2)::text, tests.h(14, 2)::text, tests.item(17, 3)::text, tests.h(14, 5)::text)) $$,
  'P0001', 'creator_habit_unavailable', 'an archived habit of the creator');
reset role;
update public.habits set archived_at = null where id = tests.h(13, 2);
select tests.act(13);
select throws_ok($$ select public.respond_challenge(tests.c(17), true, tests.h(14, 1)) $$, 'P0001', 'not_rival', 'the creator cannot respond');
select tests.act(14);
select throws_ok($$ select public.respond_challenge(tests.i(99, 9), true, tests.h(14, 1)) $$, 'P0001', 'challenge_not_found', 'unknown challenge');
reset role;
delete from public.friendships where requester_id = tests.u(13);
select tests.act(14);
select throws_ok($$ select public.respond_challenge(tests.c(17), true, null, jsonb_build_object(
  tests.item(17, 1)::text, tests.h(14, 1)::text, tests.item(17, 2)::text, tests.h(14, 2)::text, tests.item(17, 3)::text, tests.h(14, 5)::text)) $$,
  'P0001', 'not_friends', 'friends only');
reset role;
insert into public.friendships (requester_id, addressee_id, status) values (tests.u(13), tests.u(14), 'accepted');
select tests.act(14);
select lives_ok($$ select public.respond_challenge(tests.c(17), true, null, jsonb_build_object(
  tests.item(17, 1)::text, tests.h(14, 1)::text, tests.item(17, 2)::text, tests.h(14, 2)::text, tests.item(17, 3)::text, tests.h(14, 5)::text)) $$,
  'the rival accepts every item at once');
reset role;
select results_eq($$ select status, starts_on from public.challenges where id = tests.c(17) $$,
  $$ values ('active', tests.today() + 1) $$, 'the challenge is active and starts tomorrow');
select results_eq($$ select position::int, status, rival_habit_id, starts_on, accepted_at is not null from public.challenge_items
    where challenge_id = tests.c(17) order by position $$,
  $$ values (1, 'active', tests.h(14, 1), tests.today() + 1, true), (2, 'active', tests.h(14, 2), tests.today() + 1, true),
            (3, 'active', tests.h(14, 5), tests.today() + 1, true) $$, 'every item is active with its habit and the start date');
select is((select rival_habit_id from public.challenges where id = tests.c(17)), tests.h(14, 1), 'the legacy rival habit is item 1');
select tests.act(14);
select throws_ok($$ select public.respond_challenge(tests.c(17), true, tests.h(14, 1)) $$, 'P0001', 'challenge_not_proposed', 'answered once');
reset role;
-- decline cascades to the items
select tests.mk_challenge(18, 15, 16, 'proposed', 'daily', 2, null, 1, null);
select tests.mk_item(18, 2, 'proposed', 15, 2, null, null, 15);
select tests.act(16);
select lives_ok($$ select public.respond_challenge(tests.c(18), false) $$, 'the rival declines');
reset role;
select is((select status from public.challenges where id = tests.c(18)), 'declined', 'the challenge is declined');
select is((select array_agg(status order by position) from public.challenge_items where challenge_id = tests.c(18)),
  array['declined', 'declined'], 'and so are its items');
select is(tests.n($$ select 1 from public.challenge_periods where challenge_id = tests.c(18) $$)
  + tests.n($$ select 1 from public.debts where challenge_id = tests.c(18) $$), 0, 'no periods or debts');
-- the legacy call shape (named, 3 params) still works
select tests.mk_challenge(19, 17, 18, 'proposed', 'daily', 2, null, 1, null);
select tests.act(18);
select lives_ok($$ select public.respond_challenge(p_id := tests.c(19), p_accept := true, p_rival_habit_id := tests.h(18, 1)) $$, 'the legacy named call works');
reset role;
select results_eq($$ select i.status, i.rival_habit_id, i.starts_on, c.status from public.challenge_items i join public.challenges c on c.id = i.challenge_id
    where c.id = tests.c(19) $$, $$ values ('active', tests.h(18, 1), tests.today() + 1, 'active') $$, 'and activates its single item');

-- ============================================================ 1.8 add_challenge_item
select tests.mk_challenge(20, 19, 20, 'proposed', 'daily', 2, null, 1, null);
select tests.act(20);
select throws_ok($$ select public.add_challenge_item(tests.c(20), tests.h(20, 1)) $$, 'P0001', 'not_creator', 'a proposed challenge takes items from its creator only');
select tests.act(31);
select throws_ok($$ select public.add_challenge_item(tests.c(20), tests.h(31, 1)) $$, 'P0001', 'challenge_not_found', 'a stranger finds no challenge');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select public.add_challenge_item(tests.c(20), tests.h(19, 2)) $$, '28000', 'not_authenticated', 'login needed');
select tests.act(19);
select lives_ok($$ select public.add_challenge_item(tests.c(20), tests.h(19, 2)) $$, 'the creator adds an item to a proposed challenge');
select results_eq($$ select position::int, status, creator_habit_id, rival_habit_id, proposed_by, requires_photo from public.challenge_items
    where challenge_id = tests.c(20) and position = 2 $$,
  $$ values (2, 'proposed', tests.h(19, 2), null::uuid, tests.u(19), false) $$, 'item 2: proposed, creator side, next position');
select lives_ok($$ select public.add_challenge_item(tests.c(20), tests.h(19, 5)) $$, 'a photo habit makes a photo item');
select is((select requires_photo from public.challenge_items where challenge_id = tests.c(20) and position = 3), true, 'the item requires a photo');

reset role;
select tests.mk_challenge(21, 21, 22, 'active', 'daily', 4, tests.today() - 2, 1, 1);
delete from public.friendships where requester_id = tests.u(21);
select tests.act(21);
select throws_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 2)) $$, 'P0001', 'not_friends', 'friends only');
reset role;
insert into public.friendships (requester_id, addressee_id, status) values (tests.u(21), tests.u(22), 'accepted');
select tests.act(21);
select throws_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 1)) $$, 'P0001', 'habit_already_in_challenge', 'a habit of a live item');
select throws_ok($$ select public.add_challenge_item(tests.c(21), tests.h(22, 2)) $$, 'P0001', 'habit_invalid', 'a habit of someone else');
select throws_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 6)) $$, 'P0001', 'habit_invalid', 'a private habit');
select throws_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 7)) $$, 'P0001', 'habit_invalid', 'an archived habit');
select throws_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 2), 3) $$, 'P0001', 'invalid_target', 'a daily challenge takes no target');
select lives_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 2)) $$, 'either player adds to an active challenge (creator)');
select tests.act(22);
select lives_ok($$ select public.add_challenge_item(tests.c(21), tests.h(22, 2)) $$, 'either player adds to an active challenge (rival)');
select results_eq($$ select creator_habit_id, rival_habit_id, proposed_by, status from public.challenge_items where challenge_id = tests.c(21) and position = 3 $$,
  $$ values (null::uuid, tests.h(22, 2), tests.u(22), 'proposed') $$, 'the rival fills the rival side');
select lives_ok($$ select public.add_challenge_item(tests.c(21), tests.h(22, 3)) $$, 'item 4');
select tests.act(21);
select lives_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 3)) $$, 'item 5');
select is((select array_agg(position::int order by position) from public.challenge_items where challenge_id = tests.c(21)),
  array[1, 2, 3, 4, 5], 'positions are max + 1');
select throws_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 4)) $$, 'P0001', 'too_many_items', 'at most 5 live items');
reset role;
update public.challenges set cancel_requested_by = tests.u(21) where id = tests.c(21);
select tests.act(21);
select throws_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 4)) $$, 'P0001', 'challenge_not_open', 'a pending cancel closes the challenge to new items');
reset role;
update public.challenges set cancel_requested_by = null, status = 'cancelled' where id = tests.c(21);
select tests.act(21);
select throws_ok($$ select public.add_challenge_item(tests.c(21), tests.h(21, 4)) $$, 'P0001', 'challenge_not_open', 'a cancelled challenge');

reset role;
select tests.mk_challenge(22, 23, 24, 'active', 'weekly', 4, tests.today() - 2, 1, 1);
select tests.act(23);
select throws_ok($$ select public.add_challenge_item(tests.c(22), tests.h(23, 2)) $$, 'P0001', 'invalid_target', 'a weekly challenge needs a target');
select throws_ok($$ select public.add_challenge_item(tests.c(22), tests.h(23, 2), 8) $$, 'P0001', 'invalid_target', 'a target over 7');
select throws_ok($$ select public.add_challenge_item(tests.c(22), tests.h(23, 2), 0) $$, 'P0001', 'invalid_target', 'a target of 0');
select lives_ok($$ select public.add_challenge_item(tests.c(22), tests.h(23, 2), 3) $$, 'a weekly item with a target');
select is((select target_per_week from public.challenge_items where challenge_id = tests.c(22) and position = 2), 3, 'the target is stored');
reset role;
select tests.mk_challenge(23, 25, 26, 'active', 'daily', 2, tests.today() - 13, 1, 1);
select tests.act(25);
select throws_ok($$ select public.add_challenge_item(tests.c(23), tests.h(25, 2)) $$, 'P0001', 'challenge_ending', 'no full period left');

-- ============================================================ 1.9 respond_challenge_item / withdraw_challenge_item
reset role;
select tests.mk_challenge(24, 27, 28, 'active', 'daily', 4, tests.today() - 2, 1, 1);
select tests.mk_item(24, 2, 'proposed', 27, 2, null, null, 27);
select tests.mk_item(24, 3, 'proposed', 27, null, 28, 3, 28);
select tests.mk_item(24, 4, 'active', 27, 4, 28, 4, 27, tests.today() - 2);
select tests.mk_item(24, 5, 'proposed', 27, 5, null, null, 27, null, true);
select tests.act(27);
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true, tests.h(27, 2)) $$, 'P0001', 'not_responder', 'the proposer cannot answer');
select tests.act(28);
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true) $$, 'P0001', 'habit_required', 'accepting needs a habit');
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true, tests.h(27, 1)) $$, 'P0001', 'habit_invalid', 'a habit of someone else');
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true, tests.h(28, 6)) $$, 'P0001', 'habit_invalid', 'a private habit');
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 5), true, tests.h(28, 3)) $$, 'P0001', 'habit_needs_photo', 'a photo item needs a photo habit');
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 4), true, tests.h(28, 2)) $$, 'P0001', 'item_not_proposed', 'an active item is not answered again');
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true, tests.h(28, 4)) $$, 'P0001', 'habit_already_in_challenge', 'the habit is in another live item');
select tests.act(31);
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true, tests.h(31, 1)) $$, 'P0001', 'item_not_found', 'a stranger finds no item');
select tests.act(28);
select throws_ok($$ select public.respond_challenge_item(tests.i(99, 9), true, tests.h(28, 2)) $$, 'P0001', 'item_not_found', 'unknown item');
reset role;
update public.habits set archived_at = now() where id = tests.h(27, 2);
select tests.act(28);
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true, tests.h(28, 2)) $$, 'P0001', 'proposer_habit_unavailable', 'the proposer archived the habit');
reset role;
update public.habits set archived_at = null where id = tests.h(27, 2);
delete from public.friendships where requester_id = tests.u(27);
select tests.act(28);
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true, tests.h(28, 2)) $$, 'P0001', 'not_friends', 'friends only');
reset role;
insert into public.friendships (requester_id, addressee_id, status) values (tests.u(27), tests.u(28), 'accepted');
select tests.act(25);
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true, tests.h(28, 2)) $$, 'P0001', 'item_not_found', 'a participant of another challenge');
reset role;
select tests.mk_item(23, 2, 'proposed', 25, 2, null, null, 25);
select tests.act(26);
select throws_ok($$ select public.respond_challenge_item(tests.i(23, 2), true, tests.h(26, 2)) $$, 'P0001', 'challenge_ending', 'no full period left at accept time');
select tests.act(20);
select throws_ok($$ select public.respond_challenge_item(tests.item(20, 2), true, tests.h(20, 2)) $$, 'P0001', 'challenge_not_active', 'a proposed challenge answers items through respond_challenge');
select tests.act(28);
select is(public.respond_challenge_item(tests.i(24, 2), true, tests.h(28, 2)), tests.c(24), 'accepting returns the challenge id');
reset role;
select results_eq($$ select status, rival_habit_id, starts_on, accepted_at is not null from public.challenge_items where id = tests.i(24, 2) $$,
  $$ values ('active', tests.h(28, 2), tests.today() + 1, true) $$, 'the item is active from the next period');
select tests.act(28);
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 2), true, tests.h(28, 2)) $$, 'P0001', 'item_not_proposed', 'already answered');
select tests.act(27);
select lives_ok($$ select public.respond_challenge_item(tests.i(24, 3), false) $$, 'declining an item');
select is((select status from public.challenge_items where id = tests.i(24, 3)), 'declined', 'the item is declined');
select tests.act(28);
select throws_ok($$ select public.withdraw_challenge_item(tests.i(24, 5)) $$, 'P0001', 'not_proposer', 'only the proposer withdraws');
select tests.act(27);
select throws_ok($$ select public.withdraw_challenge_item(tests.i(24, 4)) $$, 'P0001', 'item_not_proposed', 'an active item cannot be withdrawn');
select is(public.withdraw_challenge_item(tests.i(24, 5)), tests.c(24), 'withdrawing returns the challenge id');
select is((select status from public.challenge_items where id = tests.i(24, 5)), 'withdrawn', 'the item is withdrawn');
select tests.act(19);
select lives_ok($$ select public.withdraw_challenge_item(tests.item(20, 2)) $$, 'withdraw an item of a proposed challenge');
select lives_ok($$ select public.withdraw_challenge_item(tests.item(20, 3)) $$, 'and another');
select throws_ok($$ select public.withdraw_challenge_item(tests.item(20, 1)) $$, 'P0001', 'last_item', 'a challenge keeps at least one live item');

-- a closing challenge (cancel requested, or cancelled) takes no answers
reset role;
select tests.mk_item(24, 6, 'proposed', 27, 6, null, null, 27);
update public.challenges set cancel_requested_by = tests.u(27) where id = tests.c(24);
select tests.act(28);
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 6), true, tests.h(28, 6)) $$, 'P0001', 'challenge_not_active', 'a pending cancel blocks answering an item');
reset role;
update public.challenges set cancel_requested_by = null, status = 'cancelled' where id = tests.c(24);
select tests.act(28);
select throws_ok($$ select public.respond_challenge_item(tests.i(24, 6), true, tests.h(28, 6)) $$, 'P0001', 'challenge_not_active', 'a cancelled challenge blocks answering an item');
reset role;
update public.challenges set status = 'active' where id = tests.c(24);
delete from public.challenge_items where id = tests.i(24, 6);

-- ============================================================ 1.10 cascades (no edits to remove_friend / cancel)
reset role;
select tests.mk_challenge(26, 29, 30, 'active', 'daily', 4, tests.today() - 8, 1, 1);
select tests.mk_item(26, 2, 'active', 29, 2, 30, 2, 29, tests.today() - 8);
select tests.mk_item(26, 3, 'active', 29, 3, 30, 3, 29, tests.today() - 8);
insert into public.challenge_item_results (challenge_id, period_start, item_id, player_id, met, done, needed)
  values (tests.c(26), tests.today() - 8, tests.i(26, 2), tests.u(29), false, 0, 1);
select tests.act(29);
select is(public.remove_friend(tests.u(30)), true, 'unfriending cancels the challenge of 3 items');
reset role;
select is((select status from public.challenges where id = tests.c(26)), 'cancelled', 'the challenge is cancelled');
select is((select array_agg(status order by position) from public.challenge_items where challenge_id = tests.c(26)),
  array['active', 'active', 'active'], 'the items are untouched (the challenge status closes them)');
select is((select count(*)::int from public.challenge_item_results where challenge_id = tests.c(26)), 1, 'and so are the results');
select lives_ok($$ update public.habits set visibility = 'private' where id = tests.h(29, 2) $$, 'the guards treat them as closed');
select throws_ok($$ delete from public.challenges where id = tests.c(26) $$, '23503', null, 'a challenge with items cannot be deleted before them');
delete from public.challenge_item_results where challenge_id = tests.c(26);
delete from public.challenge_items where challenge_id = tests.c(26);
select lives_ok($$ delete from public.challenges where id = tests.c(26) $$, 'results, then items, then the challenge delete cleanly');

select * from finish();
rollback;
