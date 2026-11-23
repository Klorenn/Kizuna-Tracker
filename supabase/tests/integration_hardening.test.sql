begin;
-- Integration hardening (0017): workout and exercise caps, service_role grant, books
-- finished_on lower bound, invite row locks and an immutable challenges.cancelled_at.
create extension if not exists pgtap with schema extensions;
select plan(17);

create schema tests;
create function tests.ex(k text) returns uuid language sql stable as $f$
  select id from public.exercises where key = k
$f$;
-- one set for each of the first n catalog exercises
create function tests.distinct_sets(n int) returns jsonb language sql stable as $f$
  select jsonb_agg(jsonb_build_object('exercise_id', id, 'reps', 5, 'kg', 10))
  from (select id from public.exercises where user_id is null order by key limit n) x
$f$;
grant usage on schema tests to authenticated;
grant execute on function tests.ex(text), tests.distinct_sets(int) to authenticated;

insert into auth.users (id) values
  ('a1710000-0000-0000-0000-000000000001'),
  ('a1710000-0000-0000-0000-000000000002');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a1710000-0000-0000-0000-000000000001', 'ih_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a1710000-0000-0000-0000-000000000002', 'ih_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago');
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, log_type) values
  ('b1710000-0000-0000-0000-000000000001', 'a1710000-0000-0000-0000-000000000001', 'Gimnasio', 'barbell', 'daily', 'friends', 'workout'),
  ('b1710000-0000-0000-0000-000000000002', 'a1710000-0000-0000-0000-000000000002', 'Gimnasio', 'barbell', 'daily', 'friends', 'workout');
insert into public.checkins (id, habit_id, user_id, local_date) values
  ('c1710000-0000-0000-0000-000000000001', 'b1710000-0000-0000-0000-000000000001', 'a1710000-0000-0000-0000-000000000001', '2026-11-21');

-- ============================================================ grants and function bodies (as postgres)
select ok(has_function_privilege('service_role', 'public.workout_day_types_valid(text[])', 'EXECUTE'),
  'service_role can run workout_day_types_valid');
select ok(not has_function_privilege('anon', 'public.workout_day_types_valid(text[])', 'EXECUTE'),
  'anon still cannot run workout_day_types_valid');
select ok(pg_get_functiondef('public.accept_invite(text)'::regprocedure) ~* 'for update',
  'accept_invite locks the invite row');
select ok(pg_get_functiondef('public.create_invite()'::regprocedure) ~* 'for update',
  'create_invite locks the inviter before counting');

-- ============================================================ books.finished_on lower bound
select throws_ok($$ insert into public.books (user_id, title, status, finished_on)
  values ('a1710000-0000-0000-0000-000000000001', 'Viejo', 'finished', '1899-12-31') $$,
  '23514', 'invalid_finished_on', 'a book cannot be finished before 1900');
select lives_ok($$ insert into public.books (user_id, title, status, finished_on)
  values ('a1710000-0000-0000-0000-000000000001', 'Clásico', 'finished', '1900-01-01') $$,
  '1900-01-01 is allowed');

-- ============================================================ challenges.cancelled_at
insert into public.friendships (requester_id, addressee_id, status) values
  ('a1710000-0000-0000-0000-000000000001', 'a1710000-0000-0000-0000-000000000002', 'accepted');
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on) values
  ('d1710000-0000-0000-0000-000000000001', 'a1710000-0000-0000-0000-000000000001', 'a1710000-0000-0000-0000-000000000002',
   'b1710000-0000-0000-0000-000000000001', 'b1710000-0000-0000-0000-000000000002', 'daily', null, false, 2, 1000,
   'America/Santiago', 'active', current_date - 3);
update public.challenges set status = 'cancelled' where id = 'd1710000-0000-0000-0000-000000000001';
select isnt((select cancelled_at from public.challenges where id = 'd1710000-0000-0000-0000-000000000001'), null,
  'cancelling stamps cancelled_at');
create temp table stamp as select cancelled_at from public.challenges where id = 'd1710000-0000-0000-0000-000000000001';
update public.challenges set cancelled_at = now() + interval '3 days' where id = 'd1710000-0000-0000-0000-000000000001';
select is((select cancelled_at from public.challenges where id = 'd1710000-0000-0000-0000-000000000001'),
  (select cancelled_at from stamp), 'cancelled_at cannot be moved once set');
update public.challenges set cancelled_at = null where id = 'd1710000-0000-0000-0000-000000000001';
select is((select cancelled_at from public.challenges where id = 'd1710000-0000-0000-0000-000000000001'),
  (select cancelled_at from stamp), 'cancelled_at cannot be cleared once set');
update public.challenges set status = 'cancelled', fine_amount = 2000 where id = 'd1710000-0000-0000-0000-000000000001';
select is((select cancelled_at from public.challenges where id = 'd1710000-0000-0000-0000-000000000001'),
  (select cancelled_at from stamp), 'a second cancel keeps the first stamp');

-- ============================================================ as A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1710000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select ok(public.save_workout('c1710000-0000-0000-0000-000000000001', '{full_body}', tests.distinct_sets(20)) is not null,
  'save_workout accepts 20 distinct exercises');
select throws_ok($$ select public.save_workout('c1710000-0000-0000-0000-000000000001', '{full_body}', tests.distinct_sets(21)) $$,
  'P0001', 'too_many_exercises', 'save_workout rejects 21 distinct exercises');

-- own exercises: a catalog name is taken (any case), and at most 100 active ones
select throws_ok($$ insert into public.exercises (user_id, name, muscle_group)
  values ('a1710000-0000-0000-0000-000000000001', upper((select name from public.exercises where key = 'squat')), 'legs') $$,
  'P0001', 'exercise_name_catalog', 'an own exercise cannot reuse a catalog name');
insert into public.exercises (user_id, name, muscle_group) values
  ('a1710000-0000-0000-0000-000000000001', 'Mi ejercicio', 'arms');
select throws_ok($$ update public.exercises set name = (select name from public.exercises where key = 'squat')
  where user_id = 'a1710000-0000-0000-0000-000000000001' and name = 'Mi ejercicio' $$,
  'P0001', 'exercise_name_catalog', 'renaming to a catalog name is rejected');
insert into public.exercises (user_id, name, muscle_group)
  select 'a1710000-0000-0000-0000-000000000001', 'Propio ' || g, 'core' from generate_series(2, 100) g;
select throws_ok($$ insert into public.exercises (user_id, name, muscle_group)
  values ('a1710000-0000-0000-0000-000000000001', 'Propio 101', 'core') $$,
  'P0001', 'exercise_limit', 'the 101st active own exercise is rejected');
update public.exercises set archived_at = now() where user_id = 'a1710000-0000-0000-0000-000000000001' and name = 'Mi ejercicio';
select lives_ok($$ insert into public.exercises (user_id, name, muscle_group)
  values ('a1710000-0000-0000-0000-000000000001', 'Propio 101', 'core') $$,
  'archived exercises free a slot');
select lives_ok($$ update public.exercises set name = 'Propio 2 b' where user_id = 'a1710000-0000-0000-0000-000000000001' and name = 'Propio 2' $$,
  'renaming at the cap is still allowed');

reset role;
select * from finish();
rollback;
