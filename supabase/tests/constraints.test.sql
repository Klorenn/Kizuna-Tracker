begin;
-- supabase/seed.sql loads local test users; these tests build their own fixtures inside
-- this transaction, so clear the seed first (rolled back at the end).
truncate public.profiles cascade;
delete from auth.users where email like '%@example.com';
create extension if not exists pgtap with schema extensions;
select plan(14);

-- fixtures (run as postgres; bypasses RLS)
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a0000000-0000-0000-0000-000000000001', 'user_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-000000000002', 'user_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago');
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Gym', 'barbell', 'daily', true),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Gym', 'barbell', 'daily', true);
insert into public.checkins (habit_id, user_id, local_date) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-20');
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, requires_photo, weeks, fine_amount, timezone, status)
values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'daily', true, 4, 5000, 'America/Santiago', 'active');
insert into public.debts (challenge_id, period_start, debtor_id, creditor_id, amount) values
  ('c0000000-0000-0000-0000-000000000001', '2026-11-16', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 5000);
insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'accepted');

select throws_ok(
  $$ insert into public.checkins (habit_id, user_id, local_date) values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-20') $$,
  '23505', null, 'second check-in for same habit and day is rejected');

select throws_ok(
  $$ insert into public.debts (challenge_id, period_start, debtor_id, creditor_id, amount) values ('c0000000-0000-0000-0000-000000000001', '2026-11-16', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 5000) $$,
  '23505', null, 'duplicate debt (challenge, period, debtor) is rejected');

select throws_ok(
  $$ insert into public.friendships (requester_id, addressee_id, status) values ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'pending') $$,
  '23505', null, 'reverse-direction duplicate friendship is rejected');

select throws_ok(
  $$ insert into public.friendships (requester_id, addressee_id, status) values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'pending') $$,
  '23514', null, 'self friendship is rejected');

select throws_ok(
  $$ insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values (gen_random_uuid(), 'no_auth_user', 'X', 'Y', '1990-01-01', now(), 'UTC') $$,
  '23503', null, 'profile must reference an auth user (fk checked)');

select throws_ok(
  $$ insert into auth.users (id) values ('a0000000-0000-0000-0000-000000000009');
     insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values ('a0000000-0000-0000-0000-000000000009', 'Bad_Name', 'X', 'Y', '1990-01-01', now(), 'UTC') $$,
  '23514', null, 'uppercase username is rejected (citext regex is case-insensitive, so cast to text)');

select throws_ok(
  $$ update public.challenges set fine_amount = 0 $$,
  '23514', null, 'fine_amount must be > 0');

select throws_ok(
  $$ update public.challenges set weeks = 53 $$,
  '23514', null, 'weeks must be 1..52');

select throws_ok(
  $$ update public.checkins set rejected_at = now() $$,
  '23514', null, 'rejection requires rejected_by and a valid reason together');

insert into public.checkins (habit_id, user_id, local_date, photo_sha256) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-21', 'abc'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-22', 'abc');
select is((select is_duplicate from public.checkins where local_date = '2026-11-22'), true,
  'same sha256 by same user is flagged duplicate by trigger');

select throws_ok(
  $$ insert into auth.users (id) values ('a0000000-0000-0000-0000-000000000008');
     insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values ('a0000000-0000-0000-0000-000000000008', 'no_birth', 'X', 'Y', null, now(), 'UTC') $$,
  '23514', null, 'active profile requires birth_date');

select throws_ok(
  $$ insert into public.checkins (habit_id, user_id, local_date, photo_path) values ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '2026-11-20', 'a0000000-0000-0000-0000-000000000001/x.jpg') $$,
  '23514', null, 'photo_path must be {user_id}/{checkin_id}.jpg');

select throws_ok(
  $$ update public.challenges set frequency_type = 'weekly', target_per_week = null $$,
  '23514', null, 'weekly challenge requires target_per_week');

select throws_ok(
  $$ update public.challenges set fine_amount = 10000001 $$,
  '23514', null, 'fine_amount capped at 10,000,000');

select * from finish();
rollback;
