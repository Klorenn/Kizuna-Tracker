begin;
-- Hardening (0014): fixes from the whole-branch review. supabase/seed.sql loads local test
-- users; these tests build their own fixtures inside this transaction (rolled back at the end).
truncate public.profiles cascade;
delete from auth.users where email like '%@example.com';
create extension if not exists pgtap with schema extensions;
select plan(52);

create schema tests;
create function tests.n(q text) returns int language plpgsql as $f$
declare c int;
begin
  execute 'with u as (' || q || ') select count(*)::int from u' into c;
  return c;
end $f$;
grant usage on schema tests to authenticated;
grant execute on function tests.n(text) to authenticated;

-- A and B are friends with two active challenges; C has a pending request to A;
-- D is a deleted account; E only exists for the reminder candidates.
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000005');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at) values
  ('a0000000-0000-0000-0000-000000000001', 'user_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a0000000-0000-0000-0000-000000000002', 'user_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a0000000-0000-0000-0000-000000000003', 'user_c', 'C', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a0000000-0000-0000-0000-000000000005', 'user_e', 'E', 'Test', '1990-01-01', now(), 'America/Santiago', null);
-- the reserved prefix is fine on a deleted row (that is what account deletion writes)
select lives_ok($$ insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at)
  values ('a0000000-0000-0000-0000-000000000004', 'deleted_a00000000004', 'Cuenta', 'eliminada', null, now(), 'UTC', now()) $$,
  'deleted rows may use the deleted_ prefix');

insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'accepted'),
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'pending');
insert into public.habits (id, user_id, name, icon, frequency_type, target_per_week, requires_photo, visibility, archived_at) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Gym', 'barbell', 'daily', null, true, 'friends', null),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Leer', 'book', 'daily', null, false, 'friends', null),
  ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000002', 'Correr', 'run', 'daily', null, false, 'friends', null),
  ('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000002', 'Gym B', 'barbell', 'daily', null, false, 'friends', null),
  ('b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000003', 'Foto', 'camera', 'daily', null, true, 'friends', null),
  ('b0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000003', 'Pasos', 'list', 'daily', null, false, 'friends', null),
  ('b0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000005', 'Agua', 'drop', 'daily', null, false, 'friends', null),
  ('b0000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000005', 'Nadar', 'waves', 'weekly', 1, false, 'friends', null),
  ('b0000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000005', 'Viejo', 'moon', 'daily', null, false, 'friends', now());
-- I4 path: a step is archived, then the habit starts asking for a photo
insert into public.habit_items (id, habit_id, user_id, label, position, archived_at) values
  ('f0000000-0000-0000-0000-000000000013', 'b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000002', 'Paso', 0, now());
update public.habits set requires_photo = true where id = 'b0000000-0000-0000-0000-000000000013';

insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000013', 'weekly', 3, true, 4, 4500, 'America/Santiago', 'active', current_date - 3),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000012', 'daily', null, false, 2, 1000, 'America/Santiago', 'active', current_date - 3);
insert into public.invites (inviter_id, code, expires_at) values
  ('a0000000-0000-0000-0000-000000000001', 'hardening-code', now() + interval '7 days');

-- ============================================================ I1 friendships
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(tests.n($$ delete from public.friendships where addressee_id = 'a0000000-0000-0000-0000-000000000002' returning 1 $$), 0,
  'an accepted friendship cannot be deleted directly');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(tests.n($$ delete from public.friendships where requester_id = 'a0000000-0000-0000-0000-000000000003' and status = 'pending' returning 1 $$), 1,
  'a pending request can still be withdrawn directly');
reset role;
select is((select count(*)::int from public.friendships where status = 'accepted'), 1, 'the accepted friendship is still there');

-- a friendship row that disappeared some other way (pre-0014 direct delete) must not trap open challenges
delete from public.friendships where status = 'accepted';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(public.remove_friend('a0000000-0000-0000-0000-000000000001'), true, 'remove_friend cancels even without a friendship row');
select is(public.remove_friend('a0000000-0000-0000-0000-000000000001'), false, 'second call has nothing left to do');
reset role;
select is((select count(*)::int from public.challenges where status = 'cancelled'), 2, 'both open challenges were cancelled');
-- back to the active state for the I4 checks below
update public.challenges set status = 'active', cancelled_at = null;
insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'accepted');

-- ============================================================ I2 push_subscriptions
select ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT'), 'clients cannot insert push subscriptions');
select ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE'), 'clients cannot update push subscriptions');
select ok(not has_column_privilege('authenticated', 'public.push_subscriptions', 'endpoint', 'INSERT'), 'no column insert on endpoint');
select ok(not has_column_privilege('authenticated', 'public.push_subscriptions', 'endpoint', 'UPDATE'), 'no column update on endpoint');
select ok(has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE'), 'clients can still delete their own');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('a0000000-0000-0000-0000-000000000001', 'https://fcm.googleapis.com/fcm/send/x', 'k', 'a') $$,
  '42501', null, 'direct insert is refused');
reset role;
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('a0000000-0000-0000-0000-000000000001', 'http://169.254.169.254/latest/meta-data/', 'k', 'a') $$,
  '23514', null, 'plain http metadata endpoint violates the check');
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('a0000000-0000-0000-0000-000000000001', 'https://fcm.googleapis.com.evil.example/x', 'k', 'a') $$,
  '23514', null, 'look-alike host violates the check');
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('a0000000-0000-0000-0000-000000000001', 'https://user@fcm.googleapis.com/x', 'k', 'a') $$,
  '23514', null, 'userinfo violates the check');
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('a0000000-0000-0000-0000-000000000001', 'https://fcm.googleapis.com:8443/x', 'k', 'a') $$,
  '23514', null, 'a non-443 port violates the check');
select lives_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('a0000000-0000-0000-0000-000000000001', 'https://fcm.googleapis.com/fcm/send/a', 'k', 'a'),
  ('a0000000-0000-0000-0000-000000000005', 'https://updates.push.services.mozilla.com/wpush/v2/e', 'k', 'a'),
  ('a0000000-0000-0000-0000-000000000004', 'https://web.push.apple.com/d', 'k', 'a'),
  ('a0000000-0000-0000-0000-000000000002', 'https://wns2-par02p.notify.windows.com/w/?token=b', 'k', 'a') $$,
  'allow-listed push services pass the check');

-- ============================================================ I3 reserved usernames
select throws_ok($$ update public.profiles set username = 'deleted_a0000000000x' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a live profile cannot take a deleted_ handle');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE'), 'clients cannot change their username');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'avatar_path', 'UPDATE'), 'clients cannot point avatar_path');
select ok(has_column_privilege('authenticated', 'public.profiles', 'first_name', 'UPDATE'), 'clients can still edit their name');
select is(public.username_available('deleted_abc'), false, 'deleted_ handles are never available');
select is(public.username_available('libre_1'), true, 'a free handle is available');
-- M2: only the server (service role) checks handles, behind the app's throttle
select ok(not has_function_privilege('anon', 'public.username_available(text)', 'execute'), 'anon cannot call username_available');
select ok(not has_function_privilege('authenticated', 'public.username_available(text)', 'execute'), 'authenticated cannot call username_available');
select ok(has_function_privilege('service_role', 'public.username_available(text)', 'execute'), 'service role can call username_available');

-- ============================================================ I4 photo habits and steps
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ update public.habit_items set archived_at = null where id = 'f0000000-0000-0000-0000-000000000013' $$,
  'P0001', 'photo_conflict', 'a step cannot come back on a habit that asks for a photo');
reset role;
select throws_ok($$ insert into public.habit_items (habit_id, user_id, label, position)
  values ('b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000003', 'Paso', 0) $$,
  'P0001', 'photo_conflict', 'no active step on a photo habit, whoever inserts it');
select lives_ok($$ insert into public.habit_items (habit_id, user_id, label, position, archived_at)
  values ('b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000003', 'Viejo', 1, now()) $$,
  'an archived step on a photo habit is harmless');

-- legacy state (a step un-archived before 0014): the day must not complete without a photo
alter table public.habit_items disable trigger user;
update public.habit_items set archived_at = null where id = 'f0000000-0000-0000-0000-000000000013';
alter table public.habit_items enable trigger user;
insert into public.checkin_items (item_id, habit_id, user_id, local_date) values
  ('f0000000-0000-0000-0000-000000000013', 'b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000002', current_date);
set local role service_role;
select is(public.complete_day_from_items('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000002', current_date), false,
  'steps never complete the day of a photo habit');
select is(public.complete_day_from_items('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', current_date), false,
  'nor for a user who does not own the habit');
reset role;
select is((select count(*)::int from public.checkins where habit_id = 'b0000000-0000-0000-0000-000000000013'), 0, 'no photo-less check-in was created');

-- M4: at most 12 active steps per habit, whoever inserts them
select lives_ok($$ insert into public.habit_items (habit_id, user_id, label, position)
  select 'b0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000003', 'p' || n, n from generate_series(1, 12) n $$,
  'twelve steps fit');
select throws_ok($$ insert into public.habit_items (habit_id, user_id, label, position)
  values ('b0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000003', 'p13', 13) $$,
  'P0001', 'too_many_items', 'the thirteenth step is refused');

-- ============================================================ M1 deleted accounts with a live token
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$ select public.create_invite() $$, '42501', null, 'a deleted account cannot create invites');
select throws_ok($$ select public.accept_invite('hardening-code') $$, '42501', null, 'a deleted account cannot accept invites');
select throws_ok($$ insert into public.friendships (requester_id, addressee_id, status)
  values ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'pending') $$,
  '42501', null, 'a deleted account cannot send friend requests');
select throws_ok($$ update public.profiles set first_name = 'Real' where id = 'a0000000-0000-0000-0000-000000000004' $$,
  '42501', null, 'a deleted account cannot un-scrub its profile');
select throws_ok($$ select public.remove_friend('a0000000-0000-0000-0000-000000000001') $$, '42501', null,
  'a deleted account cannot cancel challenges by unfriending');
-- live accounts are unaffected
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select lives_ok($$ select public.create_invite() $$, 'a live account still creates invites');
reset role;
select is((select count(*)::int from public.friendships where requester_id = 'a0000000-0000-0000-0000-000000000004'
  or addressee_id = 'a0000000-0000-0000-0000-000000000004'), 0, 'no friendship was created for the deleted account');

-- ============================================================ I6 settled challenges and reminder candidates
select has_column('public', 'challenges', 'settled_at', 'challenges.settled_at exists');
select ok(not has_column_privilege('authenticated', 'public.challenges', 'settled_at', 'UPDATE'), 'clients cannot settle challenges');

-- E: daily done today, weekly target met this week, archived habit ignored -> nothing pending
insert into public.checkins (habit_id, user_id, local_date) values
  ('b0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000005', (now() at time zone 'America/Santiago')::date),
  ('b0000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000005',
   date_trunc('week', now() at time zone 'America/Santiago')::date);
-- A: Leer not done today -> pending (Gym has a rejected check-in today, which does not count)
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, rejected_at, rejected_by, reject_reason) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   (now() at time zone 'America/Santiago')::date,
   'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000001.jpg', now(), 'a0000000-0000-0000-0000-000000000002', 'unclear');

select ok(not has_function_privilege('authenticated', 'public.reminder_candidates()', 'execute'), 'clients cannot list reminder candidates');
select ok(not has_function_privilege('anon', 'public.reminder_candidates()', 'execute'), 'anon cannot list reminder candidates');
set local role service_role;
select is((select array_agg(user_id order by user_id) from public.reminder_candidates()),
  array['a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005']::uuid[],
  'only live users with a subscription are candidates');
select is((select pending_today from public.reminder_candidates() where user_id = 'a0000000-0000-0000-0000-000000000001'), true,
  'an unchecked daily habit is pending');
select is((select pending_today from public.reminder_candidates() where user_id = 'a0000000-0000-0000-0000-000000000005'), false,
  'done today, weekly target met and archived habits mean nothing is pending');
select is((select timezone from public.reminder_candidates() where user_id = 'a0000000-0000-0000-0000-000000000005'), 'America/Santiago',
  'the candidate carries its timezone');
reset role;

-- ============================================================ M3 service role on future tables
create table public.hardening_future (id int);
select ok(has_table_privilege('service_role', 'public.hardening_future', 'INSERT'), 'future tables are writable by the service role');
select ok(not has_table_privilege('authenticated', 'public.hardening_future', 'SELECT'), 'and still closed to clients');

select * from finish();
rollback;
