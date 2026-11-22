begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a0000000-0000-0000-0000-000000000001', 'user_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-000000000002', 'user_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-000000000003', 'user_c', 'C', 'Test', '1990-01-01', now(), 'America/Santiago');
insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'accepted');
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Leer', 'book', 'daily', true, 'public'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Gimnasio', 'barbell', 'daily', false, 'friends'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Diario', 'moon', 'daily', false, 'private'),
  ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002', 'Leer B', 'book', 'daily', true, 'friends'),
  ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000002', 'Correr', 'run', 'daily', false, 'friends');
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002',
   current_date - 3, 'a0000000-0000-0000-0000-000000000002/d0000000-0000-0000-0000-000000000001.jpg', now() - interval '25 hours'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002',
   current_date - 2, 'a0000000-0000-0000-0000-000000000002/d0000000-0000-0000-0000-000000000002.jpg', now()),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002',
   current_date - 1, null, now());

-- fixtures (clients cannot set ids): ch1 weekly photo; ch2 and ch3 daily
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'weekly', 3, true, 4, 4500, 'America/Santiago'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000, 'America/Santiago'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000, 'America/Santiago');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- private habits cannot back a challenge
select throws_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'daily', null, false, 2, 1000, 'America/Santiago') $$,
  '42501', null, 'private habit cannot be challenged');
-- a valid proposal by the creator goes through
select lives_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000, 'America/Santiago') $$,
  'creator can propose with a shared habit');
-- requires_photo must match the habit
select throws_ok($$ insert into public.challenges (creator_id, rival_id, creator_habit_id, frequency_type, target_per_week, requires_photo, weeks, fine_amount, timezone)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'daily', null, true, 2, 1000, 'America/Santiago') $$,
  '42501', null, 'requires_photo must match the habit');

select throws_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000001', true, 'b0000000-0000-0000-0000-000000000011') $$,
  'P0001', 'not_rival', 'creator cannot respond');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000003', true) $$,
  'P0001', 'rival_habit_required', 'accepting needs a habit');
select throws_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000001', true, 'b0000000-0000-0000-0000-000000000012') $$,
  'P0001', 'rival_habit_needs_photo', 'photo challenge needs a photo habit');
select lives_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000001', true, 'b0000000-0000-0000-0000-000000000011') $$, 'rival accepts');
select lives_ok($$ select public.respond_challenge('c0000000-0000-0000-0000-000000000002', true, 'b0000000-0000-0000-0000-000000000012') $$, 'rival accepts the daily one');
select is((select status from public.challenges where id = 'c0000000-0000-0000-0000-000000000001'), 'active', 'status active');
select ok((select starts_on > (now() at time zone 'America/Santiago')::date from public.challenges where id = 'c0000000-0000-0000-0000-000000000001'), 'starts in the future');
select is((select extract(isodow from starts_on)::int from public.challenges where id = 'c0000000-0000-0000-0000-000000000001'), 1, 'weekly starts on Monday');
select is((select starts_on from public.challenges where id = 'c0000000-0000-0000-0000-000000000002'),
  (now() at time zone 'America/Santiago')::date + 1, 'daily starts tomorrow');

-- cancel needs both sides
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.request_cancel('c0000000-0000-0000-0000-000000000002'), false, 'first cancel request does not cancel');
select is((select cancel_requested_by from public.challenges where id = 'c0000000-0000-0000-0000-000000000002'),
  'a0000000-0000-0000-0000-000000000001'::uuid, 'request recorded');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(public.request_cancel('c0000000-0000-0000-0000-000000000002'), true, 'second request cancels');

-- rejecting proofs
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.reject_checkin('d0000000-0000-0000-0000-000000000002', 'unclear') $$,
  'P0001', 'not_rival', 'a third party cannot reject');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.reject_checkin('d0000000-0000-0000-0000-000000000001', 'unclear') $$,
  'P0001', 'reject_window_closed', 'after 24 h');
select lives_ok($$ select public.reject_checkin('d0000000-0000-0000-0000-000000000002', 'duplicate') $$, 'rival rejects');
select throws_ok($$ select public.reject_checkin('d0000000-0000-0000-0000-000000000002', 'other') $$,
  'P0001', 'already_rejected', 'second rejection');

-- cancel_challenges_between: only parties, only open challenges
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok($$ select public.cancel_challenges_between('a0000000-0000-0000-0000-000000000001') $$, 'unrelated caller does nothing');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.cancel_challenges_between('a0000000-0000-0000-0000-000000000002') $$, 'party cancels');

reset role;
select is((select count(*)::int from public.notifications where user_id = 'a0000000-0000-0000-0000-000000000002' and type = 'photo_rejected'), 1,
  'owner gets one photo_rejected notification');
select is((select status from public.challenges where id = 'c0000000-0000-0000-0000-000000000003'), 'cancelled', 'open challenge cancelled');
select ok((select rejected_at is not null and reject_reason = 'duplicate' and rejected_by = 'a0000000-0000-0000-0000-000000000001' from public.checkins where id = 'd0000000-0000-0000-0000-000000000002'), 'rejection recorded');
select * from finish();
rollback;
