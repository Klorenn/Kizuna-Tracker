begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

create schema tests;
create function tests.n(q text) returns int language plpgsql as $f$
declare c int;
begin
  execute 'with u as (' || q || ') select count(*)::int from u' into c;
  return c;
end $f$;
grant usage on schema tests to authenticated;
grant execute on function tests.n(text) to authenticated;

-- Users: A owner, B accepted friend, C stranger, D pending requester (D -> A)
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000004');
insert into public.profiles (id, username, display_name, timezone, is_adult) values
  ('a0000000-0000-0000-0000-000000000001', 'user_a', 'A', 'America/Santiago', true),
  ('a0000000-0000-0000-0000-000000000002', 'user_b', 'B', 'America/Santiago', true),
  ('a0000000-0000-0000-0000-000000000003', 'user_c', 'C', 'America/Santiago', true),
  ('a0000000-0000-0000-0000-000000000004', 'user_d', 'D', 'America/Santiago', true);
insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'accepted'),
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'pending');
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Gym', 'barbell', 'daily', true),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Gym', 'barbell', 'daily', true);
insert into public.checkins (id, habit_id, user_id, local_date, photo_path) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-20',
   'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000001.jpg');
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, requires_photo, weeks, fine_amount, timezone, status)
values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'daily', true, 4, 5000, 'America/Santiago', 'active');
insert into public.challenge_periods (challenge_id, period_start, period_end) values
  ('c0000000-0000-0000-0000-000000000001', '2026-11-16', '2026-11-22');
-- A (debtor) owes B (creditor)
insert into public.debts (id, challenge_id, period_start, debtor_id, creditor_id, amount) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-11-16',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 5000);
insert into public.notifications (user_id, type, payload) values
  ('a0000000-0000-0000-0000-000000000001', 'reminder', '{}'::jsonb);
insert into public.invites (code, inviter_id, expires_at) values
  ('code-a', 'a0000000-0000-0000-0000-000000000001', now() + interval '1 day');
insert into storage.objects (bucket_id, name, owner)
values ('proofs', 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000001.jpg', 'a0000000-0000-0000-0000-000000000001');

-- structural checks (as postgres)
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity $$,
  'every public table has RLS enabled');
select is_empty(
  $$ select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' $$,
  'anon has no table privileges in public');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'public_profiles'), 4,
  'public_profiles exposes exactly 4 columns');
select is((select public from storage.buckets where id = 'proofs'), false, 'proofs bucket is private');
select is(public.is_friend('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'), true, 'is_friend true (a,b)');
select is(public.is_friend('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'), true, 'is_friend true (b,a)');
select is(public.is_friend('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004'), false, 'is_friend false for pending');
select is(public.is_friend('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003'), false, 'is_friend false for stranger');

-- ===== C: stranger =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is((select count(*)::int from public.checkins), 0, 'stranger sees 0 checkins');
select is((select count(*)::int from public.habits), 0, 'stranger sees 0 habits');
select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000001'), 0, 'stranger cannot read others base profile');
select is((select count(*)::int from public.public_profiles where username = 'user_a'), 1, 'stranger finds user by @username via public_profiles');
select is((select count(*)::int from public.challenges), 0, 'stranger sees 0 challenges');
select is((select count(*)::int from public.challenge_periods), 0, 'stranger sees 0 challenge_periods');
select is((select count(*)::int from public.debts), 0, 'stranger sees 0 debts');
select is((select count(*)::int from public.notifications), 0, 'stranger sees 0 notifications');
select is((select count(*)::int from public.invites), 0, 'stranger sees 0 invites');
select is((select count(*)::int from public.friendships), 0, 'stranger sees 0 friendships');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs'), 0, 'stranger cannot read proofs objects');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('proofs', 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000009.jpg', 'a0000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'stranger cannot upload into someone elses proofs folder');
select throws_ok(
  $$ insert into public.checkins (habit_id, user_id, local_date) values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '2026-11-21') $$,
  '42501', null, 'cannot check in on a habit that is not yours');

-- ===== D: pending =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.checkins), 0, 'pending friend sees 0 checkins');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs'), 0, 'pending friend cannot read proofs');
select is(tests.n($$ update public.friendships set status = 'accepted' where requester_id = 'a0000000-0000-0000-0000-000000000004' returning 1 $$),
  0, 'requester cannot accept their own request');

-- ===== B: accepted friend / creditor =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.checkins where user_id = 'a0000000-0000-0000-0000-000000000001'), 1, 'accepted friend sees checkins');
select is((select count(*)::int from public.habits where user_id = 'a0000000-0000-0000-0000-000000000001'), 1, 'accepted friend sees habits');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs'), 1, 'accepted friend reads proofs');
select is((select count(*)::int from public.challenges), 1, 'participant sees challenge');
select is((select count(*)::int from public.challenge_periods), 1, 'participant sees challenge period');
select is((select count(*)::int from public.debts), 1, 'creditor sees debt');
select is(tests.n($$ update public.checkins set photo_path = 'x' where user_id = 'a0000000-0000-0000-0000-000000000001' returning 1 $$),
  0, 'friend cannot edit friends checkin');
select throws_ok($$ update public.debts set amount = 1 $$, '42501', null, 'creditor cannot change debt amount');
select throws_ok($$ update public.debts set debtor_id = creditor_id $$, '42501', null, 'creditor cannot change debtor');
select is(tests.n($$ update public.debts set paid_at = now() returning 1 $$), 1, 'creditor can mark paid');
select is(tests.n($$ update public.debts set paid_at = null returning 1 $$), 1, 'creditor can unmark paid');
select throws_ok($$ insert into public.debts (challenge_id, period_start, debtor_id, creditor_id, amount) values ('c0000000-0000-0000-0000-000000000001', '2026-11-23', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 1) $$,
  '42501', null, 'clients cannot insert debts');

-- ===== A: owner / debtor =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.checkins), 1, 'owner sees own checkins');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs'), 1, 'owner reads own proofs');
select is(tests.n($$ update public.debts set paid_at = now() returning 1 $$), 0, 'debtor cannot mark paid (RLS filters row)');
select throws_ok($$ update public.debts set amount = 0 $$, '42501', null, 'debtor cannot change debt amount');
select throws_ok($$ update public.debts set creditor_id = debtor_id $$, '42501', null, 'debtor cannot change creditor');
select throws_ok($$ delete from public.debts $$, '42501', null, 'debtor cannot delete debt');
select throws_ok($$ update public.checkins set rejected_at = now() $$, '42501', null, 'owner cannot set rejected_at');
select throws_ok($$ update public.checkins set is_duplicate = true $$, '42501', null, 'owner cannot set is_duplicate');
select throws_ok(
  $$ insert into public.checkins (habit_id, user_id, local_date, rejected_at) values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-21', now()) $$,
  '42501', null, 'owner cannot insert a pre-rejected checkin');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('proofs', 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000002.jpg', 'a0000000-0000-0000-0000-000000000001') $$,
  'owner uploads into own folder');
select is((select count(*)::int from public.friendships where status = 'pending'), 1, 'addressee sees incoming request');
select is(tests.n($$ update public.friendships set status = 'accepted' where addressee_id = 'a0000000-0000-0000-0000-000000000001' and status = 'pending' returning 1 $$),
  1, 'addressee accepts request');

select * from finish();
rollback;
