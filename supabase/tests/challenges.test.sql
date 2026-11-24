begin;
-- supabase/seed.sql loads local test users; these tests build their own fixtures inside
-- this transaction, so clear the seed first (rolled back at the end).
truncate public.profiles cascade;
delete from auth.users where email like '%@example.com';
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000006');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a0000000-0000-0000-0000-000000000001', 'user_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-000000000002', 'user_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-000000000003', 'user_c', 'C', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-000000000004', 'user_d', 'D', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-000000000005', 'user_e', 'E', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-000000000006', 'user_f', 'F', 'Test', '1990-01-01', now(), 'America/Santiago');
insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'accepted'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'accepted'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'accepted'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'accepted');
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Leer', 'book', 'daily', true, 'public'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Gimnasio', 'barbell', 'daily', false, 'friends'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Diario', 'moon', 'daily', false, 'private'),
  ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002', 'Leer B', 'book', 'daily', true, 'friends'),
  ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000002', 'Correr', 'run', 'daily', false, 'friends'),
  ('b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000004', 'Correr D', 'run', 'daily', false, 'friends');
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002',
   current_date - 3, 'a0000000-0000-0000-0000-000000000002/d0000000-0000-0000-0000-000000000001.jpg', now() - interval '25 hours'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002',
   current_date - 2, 'a0000000-0000-0000-0000-000000000002/d0000000-0000-0000-0000-000000000002.jpg', now()),
  ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002',
   current_date - 9, 'a0000000-0000-0000-0000-000000000002/d0000000-0000-0000-0000-000000000004.jpg', now()),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002',
   current_date - 1, null, now());

-- fixtures (clients cannot set ids): ch1 weekly photo (A-B); ch2 and ch3 daily. Only one open
-- challenge per pair is allowed, so ch2 is A-D and ch3 is A-E.
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'weekly', 3, true, 4, 4500, 'America/Santiago'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000, 'America/Santiago'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000, 'America/Santiago');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- private habits cannot back a challenge
select throws_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'daily', null, false, 2, 1000, 'America/Santiago') $$,
  '42501', null, 'private habit cannot be challenged');
-- the timezone must be the creator's own
select throws_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000, 'Pacific/Kiritimati') $$,
  '42501', null, 'foreign timezone rejected');
select throws_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000, 'Mars/Phobos') $$,
  '42501', null, 'bogus timezone rejected');
-- a valid proposal by the creator goes through
select lives_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000, 'America/Santiago') $$,
  'creator can propose with a shared habit');
-- one open challenge per pair, in either direction (unique_violation)
select throws_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000, 'America/Santiago') $$,
  '23505', null, 'a second open challenge for the same pair is rejected');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000012', 'daily', null, false, 2, 1000, 'America/Santiago') $$,
  '23505', null, 'a second open challenge for the same pair is rejected in the reverse direction');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
-- requires_photo must match the habit
select throws_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'daily', null, true, 2, 1000, 'America/Santiago') $$,
  '42501', null, 'requires_photo must match the habit');

select throws_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000001', true, 'b0000000-0000-0000-0000-000000000011') $$,
  'P0001', 'not_rival', 'creator cannot respond');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000003', true) $$,
  'P0001', 'rival_habit_required', 'accepting needs a habit');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000001', true, 'b0000000-0000-0000-0000-000000000012') $$,
  'P0001', 'rival_habit_needs_photo', 'photo challenge needs a photo habit');
select lives_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000001', true, 'b0000000-0000-0000-0000-000000000011') $$, 'rival accepts');
select is((select status from public.challenges where id = 'c0000000-0000-0000-0000-000000000001'), 'active', 'status active');
select ok((select starts_on > (now() at time zone 'America/Santiago')::date from public.challenges where id = 'c0000000-0000-0000-0000-000000000001'), 'starts in the future');
select is((select extract(isodow from starts_on)::int from public.challenges where id = 'c0000000-0000-0000-0000-000000000001'), 1, 'weekly starts on Monday');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select lives_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000002', true, 'b0000000-0000-0000-0000-000000000014') $$, 'rival accepts the daily one');
select is((select starts_on from public.challenges where id = 'c0000000-0000-0000-0000-000000000002'),
  (now() at time zone 'America/Santiago')::date + 1, 'daily starts tomorrow');

-- cancel needs both sides
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.request_cancel('c0000000-0000-0000-0000-000000000002'), false, 'first cancel request does not cancel');
select is((select cancel_requested_by from public.challenges where id = 'c0000000-0000-0000-0000-000000000002'),
  'a0000000-0000-0000-0000-000000000001'::uuid, 'request recorded');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(public.request_cancel('c0000000-0000-0000-0000-000000000002'), true, 'second request cancels');

-- rejecting proofs (the challenge starts in the future: move it back for the fixtures)
reset role;
update public.challenges set starts_on = current_date - 5 where id = 'c0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.reject_checkin('d0000000-0000-0000-0000-000000000002', 'unclear') $$,
  'P0001', 'not_rival', 'a third party cannot reject');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.reject_checkin('d0000000-0000-0000-0000-000000000001', 'unclear') $$,
  'P0001', 'reject_window_closed', 'after 24 h');
select throws_ok($$ select public.reject_checkin('d0000000-0000-0000-0000-000000000004', 'unclear') $$,
  'P0001', 'checkin_out_of_range', 'check-in before the challenge started');
select lives_ok($$ select public.reject_checkin('d0000000-0000-0000-0000-000000000002', 'duplicate') $$, 'rival rejects');
select throws_ok($$ select public.reject_checkin('d0000000-0000-0000-0000-000000000002', 'other') $$,
  'P0001', 'already_rejected', 'second rejection');

-- cancel_challenges_between is internal: a player cannot cancel while staying friends
select throws_ok($$ select public.cancel_challenges_between('a0000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'no unilateral cancel');
-- remove_friend: friendship and open challenges go together
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(public.remove_friend('a0000000-0000-0000-0000-000000000001'), false, 'not friends: nothing to remove');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.remove_friend('a0000000-0000-0000-0000-000000000002'), true, 'friendship removed');
select is((select count(*)::int from public.friendships where addressee_id = 'a0000000-0000-0000-0000-000000000002'), 0, 'friendship row is gone');
select is(public.remove_friend('a0000000-0000-0000-0000-000000000005'), true, 'friendship with the proposed rival removed');

reset role;
select is((select count(*)::int from public.notifications where user_id = 'a0000000-0000-0000-0000-000000000002' and type = 'photo_rejected'), 1,
  'owner gets one photo_rejected notification');
select is((select status from public.challenges where id = 'c0000000-0000-0000-0000-000000000003'), 'cancelled', 'proposed challenge cancelled');
select is((select status from public.challenges where id = 'c0000000-0000-0000-0000-000000000001'), 'cancelled', 'active challenge cancelled');
select is((select count(*)::int from public.debts), 0, 'no debts for the period in progress');
select ok((select rejected_at is not null and reject_reason = 'duplicate' and rejected_by = 'a0000000-0000-0000-0000-000000000001' from public.checkins where id = 'd0000000-0000-0000-0000-000000000002'), 'rejection recorded');
select * from finish();
rollback;
