begin;
-- Detailed logs (0015): books, reading entries, exercises, workout sessions and sets,
-- habits.log_type, plus the private body weight and height of the addendum.
create extension if not exists pgtap with schema extensions;
select plan(131);

create schema tests;
create function tests.n(q text) returns int language plpgsql as $f$
declare c int;
begin
  execute 'with u as (' || q || ') select count(*)::int from u' into c;
  return c;
end $f$;
-- uuid of a catalog exercise
create function tests.ex(k text) returns uuid language sql stable as $f$
  select id from public.exercises where key = k
$f$;
-- n identical sets of one exercise, as the p_sets payload
create function tests.sets(ex uuid, reps int, kg numeric, n int) returns jsonb language sql stable as $f$
  select coalesce(jsonb_agg(jsonb_build_object('exercise_id', ex, 'reps', reps, 'kg', kg)), '[]'::jsonb)
  from generate_series(1, n)
$f$;
grant usage on schema tests to authenticated, anon;
grant execute on function tests.n(text), tests.ex(text), tests.sets(uuid, int, numeric, int) to authenticated, anon;

-- A and B are accepted friends, C is a stranger.
insert into auth.users (id) values
  ('a1700000-0000-0000-0000-000000000001'),
  ('a1700000-0000-0000-0000-000000000002'),
  ('a1700000-0000-0000-0000-000000000003');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a1700000-0000-0000-0000-000000000001', 'logs_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a1700000-0000-0000-0000-000000000002', 'logs_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a1700000-0000-0000-0000-000000000003', 'logs_c', 'C', 'Test', '1990-01-01', now(), 'America/Santiago');
insert into public.friendships (requester_id, addressee_id, status) values
  ('a1700000-0000-0000-0000-000000000001', 'a1700000-0000-0000-0000-000000000002', 'accepted');

-- Habits are created with the pre-0015 shape (preset only); the backfill below fills log_type.
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, preset) values
  ('b1700000-0000-0000-0000-000000000001', 'a1700000-0000-0000-0000-000000000001', 'Leer', 'book', 'daily', 'public', 'read'),
  ('b1700000-0000-0000-0000-000000000002', 'a1700000-0000-0000-0000-000000000001', 'Gimnasio', 'barbell', 'daily', 'friends', 'gym'),
  ('b1700000-0000-0000-0000-000000000003', 'a1700000-0000-0000-0000-000000000001', 'Agua', 'drop', 'daily', 'friends', 'water'),
  ('b1700000-0000-0000-0000-000000000004', 'a1700000-0000-0000-0000-000000000002', 'Leer', 'book', 'daily', 'friends', 'read'),
  ('b1700000-0000-0000-0000-000000000005', 'a1700000-0000-0000-0000-000000000001', 'Leer en la noche', 'book', 'daily', 'friends', null);
select is((select array_agg(log_type order by name) from public.habits where user_id = 'a1700000-0000-0000-0000-000000000001'),
  array['none', 'none', 'none', 'none'], 'a new habit defaults to log_type none');
-- the statement 0015 runs over existing rows
update public.habits set log_type = 'reading' where preset = 'read';
update public.habits set log_type = 'workout' where preset = 'gym';
update public.habits set log_type = 'reading' where id = 'b1700000-0000-0000-0000-000000000005';
select is((select log_type from public.habits where id = 'b1700000-0000-0000-0000-000000000003'), 'none', 'other presets stay none');
select throws_ok($$ update public.habits set log_type = 'yoga' where id = 'b1700000-0000-0000-0000-000000000003' $$,
  '23514', null, 'log_type only accepts none, reading or workout');

insert into public.checkins (id, habit_id, user_id, local_date) values
  ('c1700000-0000-0000-0000-000000000001', 'b1700000-0000-0000-0000-000000000001', 'a1700000-0000-0000-0000-000000000001', '2026-11-21'),
  ('c1700000-0000-0000-0000-000000000002', 'b1700000-0000-0000-0000-000000000002', 'a1700000-0000-0000-0000-000000000001', '2026-11-21'),
  ('c1700000-0000-0000-0000-000000000003', 'b1700000-0000-0000-0000-000000000003', 'a1700000-0000-0000-0000-000000000001', '2026-11-21'),
  ('c1700000-0000-0000-0000-000000000004', 'b1700000-0000-0000-0000-000000000004', 'a1700000-0000-0000-0000-000000000002', '2026-11-21');
-- a rejected check-in of A (a reading habit): the log can still be saved
insert into public.checkins (id, habit_id, user_id, local_date, rejected_at, rejected_by, reject_reason) values
  ('c1700000-0000-0000-0000-000000000005', 'b1700000-0000-0000-0000-000000000005', 'a1700000-0000-0000-0000-000000000001', '2026-11-20',
   now(), 'a1700000-0000-0000-0000-000000000002', 'other');

insert into public.books (id, user_id, title, author, total_pages) values
  ('d1700000-0000-0000-0000-000000000001', 'a1700000-0000-0000-0000-000000000001', 'Dune', 'Frank Herbert', 412),
  ('d1700000-0000-0000-0000-000000000002', 'a1700000-0000-0000-0000-000000000002', 'Ficciones', null, 200);
-- B's own exercise
insert into public.exercises (id, user_id, name, muscle_group) values
  ('e1700000-0000-0000-0000-000000000002', 'a1700000-0000-0000-0000-000000000002', 'Ejercicio de B', 'arms');

-- ============================================================ schema (as postgres)
select is((select count(*)::int from public.exercises where user_id is null), 30, 'the catalog has 30 exercises');
select is((select array_agg(muscle_group || ':' || n order by muscle_group)
           from (select muscle_group, count(*) n from public.exercises where user_id is null group by 1) g),
  array['arms:5', 'back:5', 'chest:5', 'core:4', 'legs:7', 'shoulders:4'], 'catalog groups: 7 legs, 5 chest, 5 back, 4 shoulders, 5 arms, 4 core');
select ok((select bool_and(has_table_privilege('service_role', 'public.' || t, 'DELETE'))
           from unnest(array['books', 'reading_entries', 'exercises', 'workout_sessions', 'workout_sets', 'body_weights']) t),
  'service_role can delete from every new table');
select ok((select bool_and(not has_table_privilege('anon', 'public.' || t, 'SELECT'))
           from unnest(array['books', 'reading_entries', 'exercises', 'workout_sessions', 'workout_sets', 'body_weights']) t),
  'anon has no privileges on the new tables');
select ok((select bool_and(relrowsecurity) from pg_class
           where oid = any(array['public.books'::regclass, 'public.reading_entries'::regclass, 'public.exercises'::regclass,
                                 'public.workout_sessions'::regclass, 'public.workout_sets'::regclass, 'public.body_weights'::regclass])),
  'RLS is enabled on every new table');
select throws_ok($$ insert into public.books (user_id, title, status) values ('a1700000-0000-0000-0000-000000000001', 'X', 'finished') $$,
  '23514', null, 'a finished book needs finished_on');
select throws_ok($$ insert into public.books (user_id, title, total_pages) values ('a1700000-0000-0000-0000-000000000001', 'X', 20001) $$,
  '23514', null, 'a book has at most 20000 pages');
select throws_ok($$ insert into public.exercises (name, muscle_group, key) values ('Cardio', 'cardio', 'x') $$,
  '23514', null, 'the muscle group is one of the six groups');

-- ============================================================ reading (A)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select ok(public.save_reading_entry('c1700000-0000-0000-0000-000000000001', 'd1700000-0000-0000-0000-000000000001', 14, 40) is not null,
  'save_reading_entry returns the entry id');
select is((select local_date from public.reading_entries where checkin_id = 'c1700000-0000-0000-0000-000000000001'),
  '2026-11-21'::date, 'the entry date comes from the check-in');
select is((select habit_id from public.reading_entries where checkin_id = 'c1700000-0000-0000-0000-000000000001'),
  'b1700000-0000-0000-0000-000000000001'::uuid, 'the entry keeps the habit of the check-in');
select ok(public.save_reading_entry('c1700000-0000-0000-0000-000000000001', 'd1700000-0000-0000-0000-000000000001', 20, 46) is not null,
  'saving again updates the entry');
select is(tests.n($$ select 1 from public.reading_entries where checkin_id = 'c1700000-0000-0000-0000-000000000001' and from_page = 20 and to_page = 46 $$), 1,
  'one row per check-in, with the new pages');
select throws_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000004', 'd1700000-0000-0000-0000-000000000001', 1, 2) $$,
  'P0001', 'checkin_not_found', 'a check-in of someone else is not found');
select throws_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000003', 'd1700000-0000-0000-0000-000000000001', 1, 2) $$,
  'P0001', 'log_type_mismatch', 'a habit without reading log refuses a reading');
select throws_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000002', 'd1700000-0000-0000-0000-000000000001', 1, 2) $$,
  'P0001', 'log_type_mismatch', 'a workout habit refuses a reading');
select throws_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000001', 'd1700000-0000-0000-0000-000000000001', 40, 14) $$,
  'P0001', 'invalid_pages', 'to_page cannot be below from_page');
select throws_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000001', 'd1700000-0000-0000-0000-000000000001', -1, 3) $$,
  'P0001', 'invalid_pages', 'pages start at 0');
select throws_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000001', 'd1700000-0000-0000-0000-000000000001', 14, 413) $$,
  'P0001', 'invalid_pages', 'to_page cannot pass the pages of the book');
select throws_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000001', 'd1700000-0000-0000-0000-000000000002', 1, 2) $$,
  'P0001', 'book_not_found', 'the book of someone else is not found');
select ok(public.save_reading_entry('c1700000-0000-0000-0000-000000000001', 'd1700000-0000-0000-0000-000000000001', 14, 40, true) is not null,
  'save_reading_entry can finish the book');
select is((select status || ' ' || finished_on from public.books where id = 'd1700000-0000-0000-0000-000000000001'),
  'finished 2026-11-21', 'the book is finished on the date of the check-in');

select throws_ok($$ update public.books set status = 'finished', finished_on = current_date + 30 where id = 'd1700000-0000-0000-0000-000000000001' $$,
  '23514', 'invalid_finished_on', 'a book cannot be finished in the future');

-- ============================================================ workout (A)
select ok(public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}',
    jsonb_build_array(jsonb_build_object('exercise_id', tests.ex('squat'), 'reps', 5, 'kg', 80),
                      jsonb_build_object('exercise_id', tests.ex('squat'), 'reps', 5, 'kg', 82.5))) is not null,
  'save_workout returns the session id');
select is(tests.n($$ select 1 from public.workout_sessions where checkin_id = 'c1700000-0000-0000-0000-000000000002'
                      and local_date = '2026-11-21' and day_types = '{legs}' $$), 1, 'one session with the date of the check-in');
select is((select array_agg(position || ':' || reps || ':' || weight_kg order by position) from public.workout_sets
           where local_date = '2026-11-21'), array['0:5:80.00', '1:5:82.50'], 'two sets in array order, with the copied local_date');
select ok(public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs,core}', tests.sets(tests.ex('squat'), 5, 80, 1)) is not null,
  'save_workout again replaces the sets');
select is(tests.n($$ select 1 from public.workout_sets $$), 1, 'one set left after the replacement');
select is(tests.n($$ select 1 from public.workout_sessions where day_types = '{legs,core}' $$), 1, 'and the day types were replaced');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{}', '[]') $$,
  'P0001', 'invalid_day_types', 'day types cannot be empty');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs,yoga}', '[]') $$,
  'P0001', 'invalid_day_types', 'unknown day type');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs,legs}', '[]') $$,
  'P0001', 'invalid_day_types', 'repeated day type');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', tests.sets(tests.ex('squat'), 5, 42.555, 1)) $$,
  'P0001', 'invalid_set', 'kg has at most 2 decimals');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', tests.sets(tests.ex('squat'), 0, 80, 1)) $$,
  'P0001', 'invalid_set', 'reps start at 1');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', tests.sets(tests.ex('squat'), 5, 1000, 1)) $$,
  'P0001', 'invalid_set', 'kg is below 1000');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', tests.sets(tests.ex('squat'), 5, -1, 1)) $$,
  'P0001', 'invalid_set', 'kg is not negative');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', '[{"exercise_id":"e1700000-0000-0000-0000-000000000002"}]') $$,
  'P0001', 'invalid_set', 'a set without reps and kg is invalid');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', '{"reps": 5}') $$,
  'P0001', 'invalid_set', 'p_sets must be an array');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', tests.sets('e1700000-0000-0000-0000-000000000002', 5, 10, 1)) $$,
  'P0001', 'exercise_not_found', 'the exercise of someone else is not found');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', tests.sets(gen_random_uuid(), 5, 10, 1)) $$,
  'P0001', 'exercise_not_found', 'an unknown exercise is not found');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}',
    (select jsonb_agg(jsonb_build_object('exercise_id', e.id, 'reps', 5, 'kg', 10)) from (select id from public.exercises where user_id is null limit 21) e,
     generate_series(1, 10) g)) $$,
  'P0001', 'too_many_sets', 'more than 200 sets');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', tests.sets(tests.ex('squat'), 5, 80, 11)) $$,
  'P0001', 'too_many_sets', 'more than 10 sets of one exercise');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000001', '{legs}', '[]') $$,
  'P0001', 'log_type_mismatch', 'a reading habit refuses a workout');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000004', '{legs}', '[]') $$,
  'P0001', 'checkin_not_found', 'a check-in of someone else is not found');
select is(tests.n($$ select 1 from public.workout_sets $$), 1, 'a failed save leaves the previous sets in place');
select lives_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs,back}', tests.sets(tests.ex('squat'), 5, 80, 10)) $$,
  '10 sets of one exercise are fine');

-- ============================================================ B and C see nothing of A
reset role;
select ok((select count(*) from public.books where user_id = 'a1700000-0000-0000-0000-000000000001') >= 1
      and (select count(*) from public.reading_entries) >= 1
      and (select count(*) from public.workout_sessions) >= 1
      and (select count(*) from public.workout_sets) >= 10, 'A has rows in every table (fixture sanity)');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(tests.n($$ select 1 from public.books where user_id = 'a1700000-0000-0000-0000-000000000001' $$), 0, 'a friend does not see the books');
select is(tests.n($$ select 1 from public.reading_entries $$), 0, 'a friend does not see reading entries');
select is(tests.n($$ select 1 from public.workout_sessions $$), 0, 'a friend does not see workout sessions');
select is(tests.n($$ select 1 from public.workout_sets $$), 0, 'a friend does not see workout sets');
select throws_ok($$ insert into public.reading_entries (user_id, habit_id, checkin_id, book_id, local_date, from_page, to_page)
  values ('a1700000-0000-0000-0000-000000000002', 'b1700000-0000-0000-0000-000000000004', 'c1700000-0000-0000-0000-000000000004',
          'd1700000-0000-0000-0000-000000000002', '2026-11-21', 1, 2) $$,
  '42501', null, 'clients cannot insert reading entries');
select throws_ok($$ insert into public.workout_sets (session_id, user_id, local_date, exercise_id, position, reps, weight_kg)
  values (gen_random_uuid(), 'a1700000-0000-0000-0000-000000000002', '2026-11-21', tests.ex('squat'), 0, 5, 10) $$,
  '42501', null, 'clients cannot insert workout sets');
select throws_ok($$ insert into public.workout_sessions (user_id, habit_id, checkin_id, local_date, day_types)
  values ('a1700000-0000-0000-0000-000000000002', 'b1700000-0000-0000-0000-000000000004', 'c1700000-0000-0000-0000-000000000004', '2026-11-21', '{legs}') $$,
  '42501', null, 'clients cannot insert workout sessions');
select is(tests.n($$ update public.books set title = 'Hack' where id = 'd1700000-0000-0000-0000-000000000001' returning 1 $$), 0,
  'a friend cannot edit the book of A');
select is(tests.n($$ delete from public.books where id = 'd1700000-0000-0000-0000-000000000001' returning 1 $$), 0,
  'a friend cannot delete the book of A');
select throws_ok($$ insert into public.books (user_id, title) values ('a1700000-0000-0000-0000-000000000001', 'Plantado') $$,
  '42501', null, 'nobody inserts a book in the name of someone else');

-- ============================================================ exercises (A)
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ insert into public.exercises (user_id, name, muscle_group) values ('a1700000-0000-0000-0000-000000000001', 'Hip thrust', 'legs') $$,
  'A creates an exercise of their own');
select throws_ok($$ insert into public.exercises (user_id, name, muscle_group) values ('a1700000-0000-0000-0000-000000000001', 'hip thrust', 'legs') $$,
  '23505', null, 'the name is unique per user, ignoring case');
select throws_ok($$ update public.exercises set muscle_group = 'arms' where name = 'Hip thrust' $$,
  '42501', null, 'the muscle group cannot change after creation');
select is(tests.n($$ update public.exercises set name = 'X' where key = 'squat' returning 1 $$), 0, 'catalog exercises cannot be renamed');
select throws_ok($$ insert into public.exercises (user_id, name, muscle_group) values (null, 'Catálogo falso', 'legs') $$,
  '42501', null, 'clients cannot add to the catalog');
select throws_ok($$ insert into public.exercises (user_id, name, muscle_group) values ('a1700000-0000-0000-0000-000000000002', 'En nombre de B', 'legs') $$,
  '42501', null, 'nobody creates an exercise in the name of someone else');
select lives_ok($$ update public.exercises set archived_at = now() where name = 'Hip thrust' $$, 'A archives their exercise');
select lives_ok($$ insert into public.exercises (user_id, name, muscle_group) values ('a1700000-0000-0000-0000-000000000001', 'hip thrust', 'legs') $$,
  'an archived name can be used again');
select is(tests.n($$ select 1 from public.exercises $$), 32, 'A sees the catalog plus their two exercises, not those of B');
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(tests.n($$ select 1 from public.exercises $$), 31, 'B sees the catalog plus their own, not those of A');
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(tests.n($$ select 1 from public.books union all select 1 from public.reading_entries
                     union all select 1 from public.workout_sessions union all select 1 from public.workout_sets $$), 0,
  'a stranger sees no logs');

-- ============================================================ undo and delete (A)
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.delete_reading_entry('c1700000-0000-0000-0000-000000000001') $$, 'delete_reading_entry runs');
select is(tests.n($$ select 1 from public.reading_entries $$), 0, 'the reading is gone');
select is(tests.n($$ select 1 from public.checkins where id = 'c1700000-0000-0000-0000-000000000001' $$), 1, 'but the check-in stays');
select lives_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000005', 'd1700000-0000-0000-0000-000000000001', 3, 9) $$,
  'a rejected check-in can still hold a reading');
select ok(public.save_workout('c1700000-0000-0000-0000-000000000002', '{cardio}', '[]') is not null, 'cardio saves a session without sets');
select is(tests.n($$ select 1 from public.workout_sessions $$), 1, 'one session');
select is(tests.n($$ select 1 from public.workout_sets $$), 0, 'and no sets');
select lives_ok($$ select public.delete_workout('c1700000-0000-0000-0000-000000000002') $$, 'delete_workout runs');
select is(tests.n($$ select 1 from public.workout_sessions $$), 0, 'the session is gone');
select is(tests.n($$ select 1 from public.checkins where id = 'c1700000-0000-0000-0000-000000000002' $$), 1, 'and the check-in stays');
select lives_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', tests.sets(tests.ex('squat'), 5, 80, 2)) $$,
  'a workout is saved again');
-- the undo of Hoy deletes the check-in; the log goes with it
select is(tests.n($$ delete from public.checkins where id = 'c1700000-0000-0000-0000-000000000002' returning 1 $$), 1, 'A undoes the check-in');
select is(tests.n($$ select 1 from public.workout_sessions $$) + tests.n($$ select 1 from public.workout_sets $$), 0,
  'the session and its sets were deleted with the check-in');

-- ============================================================ anon
reset role;
set local role anon;
select throws_ok($$ select * from public.books $$, '42501', null, 'anon cannot read books');
select throws_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000001', 'd1700000-0000-0000-0000-000000000001', 1, 2) $$,
  '42501', null, 'anon cannot call save_reading_entry');
select throws_ok($$ select public.log_body_weight(70) $$, '42501', null, 'anon cannot call log_body_weight');
reset role;

-- ============================================================ body weight and height (private)
select ok(not has_table_privilege('authenticated', 'public.body_weights', 'INSERT')
      and not has_table_privilege('authenticated', 'public.body_weights', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.body_weights', 'DELETE')
      and has_table_privilege('authenticated', 'public.body_weights', 'SELECT'), 'clients only read body_weights');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'height_cm', 'UPDATE'), 'clients cannot update height_cm directly');
select throws_ok($$ insert into public.body_weights (user_id, measured_on, weight_kg) values ('a1700000-0000-0000-0000-000000000001', '2026-11-01', 19) $$,
  '23514', null, 'the table refuses a weight below 20 kg');
select throws_ok($$ insert into public.body_weights (user_id, measured_on, weight_kg) values ('a1700000-0000-0000-0000-000000000001', '2026-11-01', 401) $$,
  '23514', null, 'the table refuses a weight above 400 kg');
select throws_ok($$ update public.profiles set height_cm = 79 where id = 'a1700000-0000-0000-0000-000000000001' $$,
  '23514', null, 'the table refuses a height below 80 cm');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(public.log_body_weight(72.4) is not null, 'log_body_weight returns the id');
select is((select measured_on from public.body_weights),
  (now() at time zone 'America/Santiago')::date, 'with no date it uses today in the timezone of the profile');
select is(public.log_body_weight(72.0), (select id from public.body_weights), 'the same day upserts and returns the same id');
select is(tests.n($$ select 1 from public.body_weights where weight_kg = 72.00 $$), 1, 'one row with the new value');
select ok(public.log_body_weight(73.456, ((now() at time zone 'America/Santiago')::date - 3)) is not null, 'a past date is accepted');
select is((select weight_kg from public.body_weights where measured_on = (now() at time zone 'America/Santiago')::date - 3), 73.46::numeric,
  'the weight is stored with 2 decimals');
select throws_ok($$ select public.log_body_weight(72, (now() at time zone 'America/Santiago')::date + 1) $$,
  'P0001', 'weight_date_future', 'a future date is refused');
select throws_ok($$ select public.log_body_weight(72, ((now() at time zone 'America/Santiago')::date - interval '5 years' - interval '1 day')::date) $$,
  'P0001', 'weight_date_too_old', 'a date older than 5 years is refused');
select lives_ok($$ select public.log_body_weight(72, ((now() at time zone 'America/Santiago')::date - interval '5 years')::date) $$,
  'exactly 5 years back is accepted');
select throws_ok($$ select public.log_body_weight(19.99) $$, 'P0001', 'invalid_weight', 'below 20 kg');
select throws_ok($$ select public.log_body_weight(400.01) $$, 'P0001', 'invalid_weight', 'above 400 kg');
select throws_ok($$ select public.log_body_weight(null) $$, 'P0001', 'invalid_weight', 'null weight');
select throws_ok($$ insert into public.body_weights (user_id, measured_on, weight_kg) values ('a1700000-0000-0000-0000-000000000001', '2026-11-02', 70) $$,
  '42501', null, 'direct insert is denied');
select throws_ok($$ update public.body_weights set weight_kg = 60 $$, '42501', null, 'direct update is denied');
select throws_ok($$ delete from public.body_weights $$, '42501', null, 'direct delete is denied');

-- height
select lives_ok($$ select public.set_height(172.5) $$, 'set_height runs');
select is((select height_cm from public.profiles where id = 'a1700000-0000-0000-0000-000000000001'), 172.5::numeric, 'the owner reads their height');
select throws_ok($$ select public.set_height(79.9) $$, 'P0001', 'invalid_height', 'below 80 cm');
select throws_ok($$ select public.set_height(250.1) $$, 'P0001', 'invalid_height', 'above 250 cm');
select throws_ok($$ update public.profiles set height_cm = 180 where id = 'a1700000-0000-0000-0000-000000000001' $$,
  '42501', null, 'height cannot be written directly');

-- delete_body_weight: own rows only
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(public.log_body_weight(80) is not null, 'B logs a weight');
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.delete_body_weight((select id from public.body_weights where measured_on = (now() at time zone 'America/Santiago')::date)), true,
  'A deletes their own weight');
select is(public.delete_body_weight(gen_random_uuid()), false, 'an unknown id deletes nothing');
reset role;
select is((select count(*)::int from public.body_weights where user_id = 'a1700000-0000-0000-0000-000000000002'), 1, 'B row exists (fixture sanity)');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.delete_body_weight((select id from public.body_weights where user_id = 'a1700000-0000-0000-0000-000000000002')), false,
  'A cannot delete a weight of B (RLS hides it, so nothing matches)');
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(tests.n($$ select 1 from public.body_weights where user_id = 'a1700000-0000-0000-0000-000000000001' $$), 0, 'an accepted friend reads no weights of A');
select is(tests.n($$ select 1 from public.profiles where id = 'a1700000-0000-0000-0000-000000000001' $$), 0, 'an accepted friend cannot read the profile row of A (height)');
select is(jsonb_typeof(public.public_profile('logs_a')), 'object', 'B can read the public profile of A');
select is((select array_agg(k order by k) from jsonb_object_keys(public.public_profile('logs_a')) k),
  array['avatarPath', 'avatarUpdatedAt', 'displayName', 'habits', 'username'], 'public_profile() keeps its explicit keys');
select ok(public.public_profile('logs_a')::text !~* '(height|weight|body|altura|peso)', 'public_profile() carries no body data');
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(tests.n($$ select 1 from public.body_weights $$), 0, 'a stranger reads no weights');
reset role;
select is((select array_agg(column_name::text order by column_name) from information_schema.columns
           where table_schema = 'public' and table_name = 'public_profiles'),
  array['avatar_path', 'display_name', 'id', 'username'], 'public_profiles still exposes exactly four columns');
set local role anon;
select throws_ok($$ select * from public.body_weights $$, '42501', null, 'anon cannot read body_weights');
reset role;

-- ============================================================ deleted accounts
update public.profiles set deleted_at = now() where id = 'a1700000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.save_reading_entry('c1700000-0000-0000-0000-000000000005', 'd1700000-0000-0000-0000-000000000001', 3, 9) $$,
  '28000', 'not_authenticated', 'a deleted account cannot save a reading');
select throws_ok($$ select public.save_workout('c1700000-0000-0000-0000-000000000002', '{legs}', '[]') $$,
  '28000', 'not_authenticated', 'a deleted account cannot save a workout');
select throws_ok($$ select public.log_body_weight(70) $$, '28000', 'not_authenticated', 'a deleted account cannot log a weight');
select throws_ok($$ select public.set_height(170) $$, '28000', 'not_authenticated', 'a deleted account cannot set the height');
select throws_ok($$ insert into public.books (user_id, title) values ('a1700000-0000-0000-0000-000000000001', 'Tarde') $$,
  '42501', 'not_authenticated', 'a deleted account cannot insert a book');
select throws_ok($$ insert into public.exercises (user_id, name, muscle_group) values ('a1700000-0000-0000-0000-000000000001', 'Tarde', 'legs') $$,
  '42501', 'not_authenticated', 'a deleted account cannot insert an exercise');
reset role;

select * from finish();
rollback;
