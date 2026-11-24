begin;
-- Final hardening (0020): pomodoro credit is never backdated, cardio RPCs answer entry_not_found,
-- check-ins inside closed challenge periods cannot be deleted by a client, the exercise cap holds
-- on un-archive, create_invite takes the lighter lock, the cron secret lives in the database and
-- the unread-notification index exists.
create extension if not exists pgtap with schema extensions;
select plan(124);

create schema tests;
create function tests.n(q text) returns int language plpgsql as $f$
declare c int;
begin
  execute 'with u as (' || q || ') select count(*)::int from u' into c;
  return c;
end $f$;
-- today in the zone of A (the same clock and zone the RPCs use)
create function tests.today() returns date language sql stable as $f$
  select (now() at time zone 'America/Santiago')::date
$f$;
-- the instant today started in a zone
create function tests.sod(tz text) returns timestamptz language sql stable as $f$
  select date_trunc('day', now() at time zone tz) at time zone tz
$f$;
-- a zone where it is about noon right now, so +-3 minutes never crosses local midnight
create function tests.noon_tz() returns text language sql stable as $f$
  select 'Etc/GMT' || case when h >= 0 then '+' else '-' end || abs(h)
  from (select extract(hour from now() at time zone 'UTC')::int - 12 as h) x
$f$;
grant usage on schema tests to authenticated, anon;
grant execute on function tests.n(text), tests.today(), tests.sod(text), tests.noon_tz() to authenticated, anon;

-- ids: users a2000000-...-0000000000NN, habits b2000000-..., blocks 92000000-...
-- 01 Santiago, 02 Honolulu (west of UTC), 03 Auckland (east), 04 exercises, 05 invites, 06 deleted, 07 rival
insert into auth.users (id) values
  ('a2000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002'),
  ('a2000000-0000-0000-0000-000000000003'),
  ('a2000000-0000-0000-0000-000000000004'),
  ('a2000000-0000-0000-0000-000000000005'),
  ('a2000000-0000-0000-0000-000000000006'),
  ('a2000000-0000-0000-0000-000000000007'),
  ('a2000000-0000-0000-0000-000000000008'),
  ('a2000000-0000-0000-0000-00000000000a'),
  ('a2000000-0000-0000-0000-00000000000b'),
  ('a2000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at) values
  ('a2000000-0000-0000-0000-000000000001', 'fh_u1', 'U1', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a2000000-0000-0000-0000-000000000002', 'fh_u2', 'U2', 'Test', '1990-01-01', now(), 'Pacific/Honolulu', null),
  ('a2000000-0000-0000-0000-000000000003', 'fh_u3', 'U3', 'Test', '1990-01-01', now(), 'Pacific/Auckland', null),
  ('a2000000-0000-0000-0000-000000000004', 'fh_u4', 'U4', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a2000000-0000-0000-0000-000000000005', 'fh_u5', 'U5', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a2000000-0000-0000-0000-000000000006', 'deleted_a20000000006', 'Cuenta', 'eliminada', null, now(), 'America/Santiago', now()),
  ('a2000000-0000-0000-0000-000000000007', 'fh_u7', 'U7', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a2000000-0000-0000-0000-000000000008', 'fh_u8', 'U8', 'Test', '1990-01-01', now(), tests.noon_tz(), null),
  -- one rival per challenge of U1: only one open challenge is allowed per pair
  ('a2000000-0000-0000-0000-00000000000a', 'fh_ua', 'UA', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a2000000-0000-0000-0000-00000000000b', 'fh_ub', 'UB', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a2000000-0000-0000-0000-00000000000c', 'fh_uc', 'UC', 'Test', '1990-01-01', now(), 'America/Santiago', null);

-- time habits for the pomodoro cases
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, preset, log_type) values
  ('b2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Estudiar', 'book', 'daily', 'friends', 'study', 'time'),
  ('b2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'Estudiar W', 'book', 'daily', 'friends', 'study', 'time'),
  ('b2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000003', 'Estudiar E', 'book', 'daily', 'friends', 'study', 'time'),
  ('b2000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000008', 'Estudiar N', 'book', 'daily', 'friends', 'study', 'time');

-- ============================================================ H1 pomodoro credit is never backdated
select has_function('public', 'add_pomodoro_block', array['uuid', 'uuid', 'integer', 'text', 'timestamp with time zone'],
  'add_pomodoro_block takes p_ended_at');
select hasnt_function('public', 'add_pomodoro_block', array['uuid', 'uuid', 'integer', 'text'],
  'the four-argument overload is gone (PostgREST sees one)');
select ok(has_function_privilege('authenticated', 'public.add_pomodoro_block(uuid,uuid,int,text,timestamptz)', 'execute'),
  'authenticated can run it');
select ok(not has_function_privilege('anon', 'public.add_pomodoro_block(uuid,uuid,int,text,timestamptz)', 'execute'),
  'anon cannot');
select ok(not has_function_privilege('public', 'public.add_pomodoro_block(uuid,uuid,int,text,timestamptz)', 'execute'),
  'nor public');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 25)), true,
  'without p_ended_at it credits as before');
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', 25, null, tests.sod('America/Santiago'))), true,
  'a block that ended at the start of today is credited');
select throws_ok($$ select * from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000003', 25, null,
  tests.sod('America/Santiago') - interval '1 minute') $$, 'P0001', 'block_expired', 'a block that ended yesterday is refused');
select throws_ok($$ select * from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000003', 25, null,
  now() - interval '3 days') $$, 'P0001', 'block_expired', 'and one from days ago');
reset role;
select is((select count(*)::int from public.pomodoro_blocks where block_id in
  ('92000000-0000-0000-0000-000000000003')), 0, 'the refused block left no receipt');
select is((select minutes from public.time_entries where habit_id = 'b2000000-0000-0000-0000-000000000001'), 50,
  'only the two credited blocks count');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', 25, null, tests.sod('America/Santiago'))), false,
  'a retry of a credited block answers credited = false');
reset role;
select is((select minutes from public.time_entries where habit_id = 'b2000000-0000-0000-0000-000000000001'), 50, 'and credits nothing twice');

-- a zone where it is about noon: future instants stay on today's local date (a phone clock that is
-- fast is clamped to now(), not refused)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000008","role":"authenticated"}', true);
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000004', 25, null,
  now() + interval '10 minutes')), true, 'an instant 10 minutes in the future is accepted and credits today');
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000005', 25, null,
  now() + interval '3 hours')), true, 'so is one 3 hours in the future');
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000004', 25, null,
  now() + interval '10 minutes')), false, 'a retry of the future-instant block credits once only');
select throws_ok($$ select * from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000006', 25, null,
  tests.sod(tests.noon_tz()) - interval '1 minute') $$, 'P0001', 'block_expired', 'yesterday is still refused in the noon zone');
-- a credited block retried with an end instant that has since expired (after midnight) still answers
-- the idempotent way
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000004', '92000000-0000-0000-0000-000000000005', 25, null,
  tests.sod(tests.noon_tz()) - interval '1 minute')), false, 'retry of a credited block with an expired instant: credited = false, no error');
-- someone else's block id with an expired instant is just expired (no receipt of the caller's)
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select * from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000005', 25, null,
  tests.sod('America/Santiago') - interval '1 minute') $$, 'P0001', 'block_expired', 'another user''s receipt does not exempt an expired instant');
reset role;
select is((select count(*)::int from public.pomodoro_blocks where block_id = '92000000-0000-0000-0000-000000000006'), 0, 'the refused block left no receipt');
select is((select minutes from public.time_entries where habit_id = 'b2000000-0000-0000-0000-000000000004'), 50, 'the two future-instant blocks credited 50 minutes, once each');

-- west of UTC (Honolulu): refused first, so nothing at all may have been written for the user
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select * from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000012', 25, null,
  tests.sod('Pacific/Honolulu') - interval '1 minute') $$, 'P0001', 'block_expired', 'west: the last minute of yesterday is refused');
reset role;
select is((select count(*)::int from public.pomodoro_blocks where user_id = 'a2000000-0000-0000-0000-000000000002'), 0, 'west: no receipt');
select is((select count(*)::int from public.time_entries where user_id = 'a2000000-0000-0000-0000-000000000002'), 0, 'west: no time entry');
select is((select count(*)::int from public.checkins where user_id = 'a2000000-0000-0000-0000-000000000002'), 0, 'west: no check-in');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000013', 25, null,
  tests.sod('Pacific/Honolulu'))), true, 'west: the first instant of the local day is credited');
-- east of UTC (Auckland)
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select * from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000022', 25, null,
  tests.sod('Pacific/Auckland') - interval '1 minute') $$, 'P0001', 'block_expired', 'east: the last minute of yesterday is refused');
reset role;
select is((select count(*)::int from public.pomodoro_blocks where user_id = 'a2000000-0000-0000-0000-000000000003'), 0, 'east: no receipt');
select is((select count(*)::int from public.checkins where user_id = 'a2000000-0000-0000-0000-000000000003'), 0, 'east: no check-in');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000023', 25, null,
  tests.sod('Pacific/Auckland'))), true, 'east: the first instant of the local day is credited');
select is((select credited from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000023', 25, null,
  tests.sod('Pacific/Auckland'))), false, 'east: the retry credits once');
-- the other users' habits and blocks keep behaving
select throws_ok($$ select * from public.add_pomodoro_block('b2000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000031', 25) $$,
  'P0001', 'habit_not_found', 'someone else''s habit is still habit_not_found');
reset role;

-- ============================================================ H2 cardio RPCs: entry_not_found
insert into public.habits (id, user_id, name, icon, frequency_type, target_per_week, visibility, preset, log_type) values
  ('b2000000-0000-0000-0000-000000000011', 'a2000000-0000-0000-0000-000000000001', 'Trotar', 'sneaker-move', 'weekly', 3, 'friends', 'run', 'cardio'),
  ('b2000000-0000-0000-0000-000000000012', 'a2000000-0000-0000-0000-000000000007', 'Trotar 7', 'sneaker-move', 'weekly', 3, 'friends', 'run', 'cardio');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
select lives_ok($$ select * from public.create_checkin('b2000000-0000-0000-0000-000000000012') $$, 'the rival checks in');
select lives_ok($$ select public.add_cardio_entry((select id from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000012' and local_date = tests.today()),
  'run', 5000, 1800) $$, 'and logs a run');
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select * from public.create_checkin('b2000000-0000-0000-0000-000000000011') $$, 'U1 checks in');
select lives_ok($$ select public.add_cardio_entry((select id from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000011' and local_date = tests.today()),
  'run', 3000, 1200) $$, 'and logs a run');
reset role;
select set_config('tests.other_entry', (select id::text from public.cardio_entries where user_id = 'a2000000-0000-0000-0000-000000000007'), true);
select set_config('tests.own_entry', (select id::text from public.cardio_entries where user_id = 'a2000000-0000-0000-0000-000000000001'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.update_cardio_entry('00000000-0000-0000-0000-00000000dead', 'run', 100, 100) $$,
  'P0001', 'entry_not_found', 'update: an unknown id is entry_not_found');
select throws_ok($$ select public.update_cardio_entry(current_setting('tests.other_entry')::uuid, 'run', 100, 100) $$,
  'P0001', 'entry_not_found', 'update: someone else''s entry gives the same answer');
select throws_ok($$ select public.delete_cardio_entry('00000000-0000-0000-0000-00000000dead') $$,
  'P0001', 'entry_not_found', 'delete: an unknown id is entry_not_found');
select throws_ok($$ select public.delete_cardio_entry(current_setting('tests.other_entry')::uuid) $$,
  'P0001', 'entry_not_found', 'delete: someone else''s entry gives the same answer');
reset role;
select is((select count(*)::int from public.cardio_entries where user_id = 'a2000000-0000-0000-0000-000000000007'), 1, 'the rival''s entry is untouched');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.delete_cardio_entry(current_setting('tests.own_entry')::uuid) $$, 'delete: the owner deletes their own entry');
reset role;
select is((select count(*)::int from public.cardio_entries where user_id = 'a2000000-0000-0000-0000-000000000001'), 0, 'and it is gone');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.delete_cardio_entry(current_setting('tests.own_entry')::uuid) $$,
  'P0001', 'entry_not_found', 'delete: the second delete of the same id is entry_not_found');
reset role;

-- ============================================================ H3 check-ins inside closed periods cannot be deleted by a client
-- U1 has habit D in an active challenge with U7: a closed period (today-10 .. today-4) and an open one.
-- NB production only ever has period rows once a period is closed (close-periods-repo insertPeriod); the
-- open row below models "not closed", which is the same to the guard as "no row yet" (tested further down).
insert into public.habits (id, user_id, name, icon, frequency_type, visibility) values
  ('b2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000001', 'D', 'book', 'daily', 'friends'),
  ('b2000000-0000-0000-0000-000000000022', 'a2000000-0000-0000-0000-000000000007', 'D rival', 'book', 'daily', 'friends'),
  ('b2000000-0000-0000-0000-000000000023', 'a2000000-0000-0000-0000-000000000001', 'Libre', 'book', 'daily', 'friends');
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on) values
  ('c2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000007',
   'b2000000-0000-0000-0000-000000000021', 'b2000000-0000-0000-0000-000000000022', 'daily', null, false, 4, 1000,
   'America/Santiago', 'active', tests.today() - 10);
insert into public.challenge_periods (challenge_id, period_start, period_end, closed_at) values
  ('c2000000-0000-0000-0000-000000000021', tests.today() - 10, tests.today() - 4, now()),
  ('c2000000-0000-0000-0000-000000000021', tests.today() - 3, tests.today() + 3, null);
insert into public.checkins (habit_id, user_id, local_date) values
  ('b2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000001', tests.today() - 8),
  ('b2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000001', tests.today() - 6),
  ('b2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000001', tests.today() - 2),
  ('b2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000001', tests.today()),
  ('b2000000-0000-0000-0000-000000000023', 'a2000000-0000-0000-0000-000000000001', tests.today() - 20);

select has_trigger('public', 'checkins', 'checkins_period_guard', 'the period guard is a trigger on checkins');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(tests.n($$ delete from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000021' and local_date = tests.today() returning 1 $$), 1,
  'undo: today''s check-in can be deleted');
select is(tests.n($$ delete from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000021' and local_date = tests.today() - 2 returning 1 $$), 1,
  'a check-in of the open period can be deleted');
select throws_ok($$ delete from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000021' and local_date = tests.today() - 8 $$,
  'P0001', 'period_closed', 'a check-in inside a closed period is refused for its owner');
select throws_ok($$ delete from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000021' $$,
  'P0001', 'period_closed', 'a bulk delete that reaches one is refused as a whole');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000021' and local_date < tests.today() - 3 $$), 2,
  'both closed-period check-ins are still there');
select is(tests.n($$ delete from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000023' returning 1 $$), 1,
  'a habit outside any challenge is not affected, whatever the date');
reset role;
-- a period that ENDED but that the cron has not closed yet has no row: the guard does not cover it
-- (documented gap, see the comment on checkins_period_guard). It cannot help the deleting player: each
-- player is judged on their own check-ins, so deleting one can only make that player fail.
insert into public.habits (id, user_id, name, icon, frequency_type, visibility) values
  ('b2000000-0000-0000-0000-000000000024', 'a2000000-0000-0000-0000-000000000001', 'Termino sin cerrar', 'book', 'daily', 'friends'),
  ('b2000000-0000-0000-0000-000000000025', 'a2000000-0000-0000-0000-00000000000a', 'Termino sin cerrar rival', 'book', 'daily', 'friends');
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on) values
  ('c2000000-0000-0000-0000-000000000024', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000a',
   'b2000000-0000-0000-0000-000000000024', 'b2000000-0000-0000-0000-000000000025', 'daily', null, false, 1, 1000,
   'America/Santiago', 'active', tests.today() - 9);
insert into public.checkins (habit_id, user_id, local_date)
values ('b2000000-0000-0000-0000-000000000024', 'a2000000-0000-0000-0000-000000000001', tests.today() - 5);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(tests.n($$ delete from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000024' returning 1 $$), 1,
  'period ended, cron not run yet (no period row): the delete still goes through (documented window)');
reset role;
-- the rival's own check-in in the same closed period: the rule follows the habit, also for the other player
insert into public.checkins (habit_id, user_id, local_date)
values ('b2000000-0000-0000-0000-000000000022', 'a2000000-0000-0000-0000-000000000007', tests.today() - 7);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
select throws_ok($$ delete from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000022' $$,
  'P0001', 'period_closed', 'the rival''s habit is guarded too');
reset role;
-- the service role (account deletion) is not subject to it
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$ delete from public.checkins where user_id = 'a2000000-0000-0000-0000-000000000007' $$, 'service_role deletes the rival''s closed-period check-in');
select lives_ok($$ delete from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000021' $$, 'and the owner''s');
reset role;
select is((select count(*)::int from public.checkins where habit_id in
  ('b2000000-0000-0000-0000-000000000021', 'b2000000-0000-0000-0000-000000000022')), 0, 'both are gone');

-- helper: not callable by anon or public, answers false for habits that are not the caller's
select ok(has_function_privilege('authenticated', 'public.habit_date_period_closed(uuid,date)', 'execute'), 'the helper is callable by authenticated');
select ok(not has_function_privilege('anon', 'public.habit_date_period_closed(uuid,date)', 'execute'), 'not by anon');
select ok(not has_function_privilege('public', 'public.habit_date_period_closed(uuid,date)', 'execute'), 'nor public');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(public.habit_date_period_closed('b2000000-0000-0000-0000-000000000021', tests.today() - 8), false,
  'another user cannot learn whether a habit has a closed period');
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.habit_date_period_closed('b2000000-0000-0000-0000-000000000021', tests.today() - 8), true, 'the owner sees true inside the closed period');
select is(public.habit_date_period_closed('b2000000-0000-0000-0000-000000000021', tests.today() - 3), false, 'and false in the open one');
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$ select public.habit_date_period_closed('b2000000-0000-0000-0000-000000000021', tests.today() - 8) $$,
  '42501', null, 'a deleted account is rejected');
reset role;
select set_config('request.jwt.claims', '', true);

-- definer RPC: uncheck_item (steps). Habit S is in a challenge whose closed period includes today.
insert into public.habits (id, user_id, name, icon, frequency_type, visibility) values
  ('b2000000-0000-0000-0000-000000000031', 'a2000000-0000-0000-0000-000000000001', 'Con pasos', 'book', 'daily', 'friends'),
  ('b2000000-0000-0000-0000-000000000032', 'a2000000-0000-0000-0000-00000000000b', 'Con pasos rival', 'book', 'daily', 'friends'),
  ('b2000000-0000-0000-0000-000000000033', 'a2000000-0000-0000-0000-000000000001', 'Pasos libres', 'book', 'daily', 'friends');
insert into public.habit_items (id, habit_id, user_id, label, position) values
  ('12000000-0000-0000-0000-000000000031', 'b2000000-0000-0000-0000-000000000031', 'a2000000-0000-0000-0000-000000000001', 'Paso', 0),
  ('12000000-0000-0000-0000-000000000033', 'b2000000-0000-0000-0000-000000000033', 'a2000000-0000-0000-0000-000000000001', 'Paso libre', 0);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select * from public.check_item('12000000-0000-0000-0000-000000000031') $$, 'the step is checked');
select lives_ok($$ select * from public.check_item('12000000-0000-0000-0000-000000000033') $$, 'and the free one');
select lives_ok($$ select public.uncheck_item('12000000-0000-0000-0000-000000000033') $$, 'a step of a habit outside any challenge can be unchecked');
reset role;
select is((select count(*)::int from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000033'), 0, 'and its check-in goes away');
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on) values
  ('c2000000-0000-0000-0000-000000000031', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000b',
   'b2000000-0000-0000-0000-000000000031', 'b2000000-0000-0000-0000-000000000032', 'daily', null, false, 4, 1000,
   'America/Santiago', 'active', tests.today() - 5);
insert into public.challenge_periods (challenge_id, period_start, period_end, closed_at) values
  ('c2000000-0000-0000-0000-000000000031', tests.today() - 5, tests.today(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.uncheck_item('12000000-0000-0000-0000-000000000031') $$,
  'P0001', 'period_closed', 'uncheck_item refuses when today falls in a closed period');
reset role;
select is((select count(*)::int from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000031' and local_date = tests.today()), 1,
  'the check-in is still there');
select is((select count(*)::int from public.checkin_items where item_id = '12000000-0000-0000-0000-000000000031'), 1, 'and so is the step');

-- definer RPC: remove_quantity_entry keeps the check-in in a closed period (rule already there since 0018)
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, log_type, quantity_unit, quantity_target, quantity_step) values
  ('b2000000-0000-0000-0000-000000000041', 'a2000000-0000-0000-0000-000000000001', 'Agua', 'drop', 'daily', 'friends', 'quantity', 'ml', 500, 250),
  ('b2000000-0000-0000-0000-000000000042', 'a2000000-0000-0000-0000-00000000000c', 'Agua 7', 'drop', 'daily', 'friends', 'quantity', 'ml', 500, 250);
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on) values
  ('c2000000-0000-0000-0000-000000000041', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000c',
   'b2000000-0000-0000-0000-000000000041', 'b2000000-0000-0000-0000-000000000042', 'daily', null, false, 4, 1000,
   'America/Santiago', 'active', tests.today() - 5);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select * from public.add_quantity_entry('b2000000-0000-0000-0000-000000000041', '92000000-0000-0000-0000-000000000041', 500) $$,
  'the goal is reached');
reset role;
insert into public.challenge_periods (challenge_id, period_start, period_end, closed_at) values
  ('c2000000-0000-0000-0000-000000000041', tests.today() - 5, tests.today(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select * from public.remove_quantity_entry('92000000-0000-0000-0000-000000000041') $$, 'the entry is removed');
reset role;
select is((select count(*)::int from public.checkins where habit_id = 'b2000000-0000-0000-0000-000000000041' and local_date = tests.today()), 1,
  'but the check-in stays in a closed period');

-- ============================================================ H4 the exercise cap also holds on un-archive
insert into public.exercises (user_id, name, muscle_group)
  select 'a2000000-0000-0000-0000-000000000004', 'Propio ' || g, 'core' from generate_series(1, 100) g;
update public.exercises set archived_at = now() where user_id = 'a2000000-0000-0000-0000-000000000004' and name = 'Propio 1';
select lives_ok($$ insert into public.exercises (user_id, name, muscle_group)
  values ('a2000000-0000-0000-0000-000000000004', 'Nuevo', 'core') $$, 'archiving one frees a slot for a new exercise');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$ update public.exercises set archived_at = null where name = 'Propio 1' $$,
  'P0001', 'exercise_limit', 'un-archiving the old one would be the 101st active exercise');
select is(tests.n($$ select 1 from public.exercises where user_id = 'a2000000-0000-0000-0000-000000000004' and archived_at is null $$), 100,
  'the cap held: 100 active');
select lives_ok($$ update public.exercises set archived_at = now() where name = 'Propio 2' $$, 'archiving is always allowed');
select lives_ok($$ update public.exercises set archived_at = null where name = 'Propio 1' $$, 'with a free slot the un-archive works');
select lives_ok($$ update public.exercises set name = 'Propio renombrado' where name = 'Propio 3' $$, 'renaming an active exercise still works');
select lives_ok($$ update public.exercises set archived_at = null where name = 'Propio 1' $$, 'un-archiving an already active one is a no-op');
select throws_ok($$ update public.exercises set archived_at = null where name = 'Propio 2' $$,
  'P0001', 'exercise_limit', 'and the cap is back at 100');
select ok(exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()),
  'the cap check holds a transaction-scoped advisory lock for the user');
select throws_ok($$ update public.exercises set name = 'Sentadilla' where name = 'Propio 4' $$,
  'P0001', 'exercise_name_catalog', 'the catalog-name check still runs on rename');
reset role;

-- ============================================================ H5 create_invite takes the lighter profile lock
select ok(pg_get_functiondef('public.exercises_own_guard()'::regprocedure) ~ 'pg_advisory_xact_lock',
  'the exercise cap serializes per user with an advisory lock');
select ok(pg_get_functiondef('public.checkins_period_guard()'::regprocedure) !~* 'current_user in \(.*\) and',
  'the period guard does not rely on AND evaluation order');
select has_index('public', 'challenges', 'challenges_creator_habit_idx', 'challenges(creator_habit_id) is indexed');
select has_index('public', 'challenges', 'challenges_rival_habit_idx', 'challenges(rival_habit_id) is indexed');
select ok(pg_get_functiondef('public.create_invite()'::regprocedure) ~* 'for no key update',
  'create_invite locks the inviter with FOR NO KEY UPDATE');
select ok(pg_get_functiondef('public.create_invite()'::regprocedure) !~* 'for update',
  'and no longer with FOR UPDATE');
select ok(has_function_privilege('authenticated', 'public.create_invite()', 'execute')
  and not has_function_privilege('anon', 'public.create_invite()', 'execute')
  and not has_function_privilege('public', 'public.create_invite()', 'execute'), 'grants are unchanged');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select count(public.create_invite())::int from generate_series(1, 5)), 5, 'five active codes are allowed');
select throws_ok($$ select public.create_invite() $$, 'P0001', 'invite_limit', 'the sixth is refused');
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$ select public.create_invite() $$, '42501', null, 'a deleted account cannot create invites');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.create_invite() $$, 'P0001', 'not_authenticated', 'without a caller it is not_authenticated');

-- ============================================================ H7 cron secret lives in the database
select ok(exists (select 1 from vault.secrets where name = 'cron_secret'), 'the cron_secret vault secret exists after the migration');
select is((select count(*)::int from vault.secrets where name = 'cron_secret'), 1, 'exactly once');
select ok((select decrypted_secret ~ '^[0-9a-f]{64}$' from vault.decrypted_secrets where name = 'cron_secret'), 'it is 64 hex characters');
create temp table cron_before as
  select id, md5(decrypted_secret) as digest from vault.decrypted_secrets where name = 'cron_secret';
select lives_ok($$ select public.ensure_cron_secret() $$, 'running the block again is fine');
select is((select count(*)::int from vault.secrets where name = 'cron_secret'), 1, 'it did not add a second secret');
select is((select count(*)::int from cron_before b join vault.decrypted_secrets s on s.id = b.id and md5(s.decrypted_secret) = b.digest), 1,
  'and did not change the stored one');
select ok(not has_function_privilege('anon', 'public.ensure_cron_secret()', 'execute')
  and not has_function_privilege('authenticated', 'public.ensure_cron_secret()', 'execute')
  and not has_function_privilege('public', 'public.ensure_cron_secret()', 'execute'), 'the generator is not callable by clients');

select function_returns('public', 'cron_secret_valid', array['text'], 'boolean', 'cron_secret_valid returns boolean');
select ok((select prosecdef and provolatile = 's' and proconfig @> array['search_path=""'] from pg_proc
  where oid = 'public.cron_secret_valid(text)'::regprocedure), 'security definer, stable, search_path = ''''');
select ok(has_function_privilege('service_role', 'public.cron_secret_valid(text)', 'execute'), 'service_role can execute it');
select ok(not has_function_privilege('anon', 'public.cron_secret_valid(text)', 'execute'), 'anon cannot');
select ok(not has_function_privilege('authenticated', 'public.cron_secret_valid(text)', 'execute'), 'authenticated cannot');
select ok(not has_function_privilege('public', 'public.cron_secret_valid(text)', 'execute'), 'public cannot');
set local role anon;
select throws_ok($$ select public.cron_secret_valid('0000000000000000000000000000000000000000000000000000000000000000') $$,
  '42501', null, 'anon is refused');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.cron_secret_valid('0000000000000000000000000000000000000000000000000000000000000000') $$,
  '42501', null, 'authenticated is refused');
reset role;
select set_config('tests.cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), true);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.cron_secret_valid(current_setting('tests.cron_secret')), true, 'the stored secret is valid');
select is(public.cron_secret_valid(repeat('0', 64)), false, 'a wrong 64-hex token is not');
select is(public.cron_secret_valid(left(current_setting('tests.cron_secret'), 40)), false, 'a prefix of the right length class is not');
select is(public.cron_secret_valid(left(current_setting('tests.cron_secret'), 31)), false, 'a short prefix is not');
select is(public.cron_secret_valid('short'), false, 'a short token is not');
select is(public.cron_secret_valid(''), false, 'an empty token is not');
select is(public.cron_secret_valid(null), false, 'null is not');
select is(public.cron_secret_valid(current_setting('tests.cron_secret') || 'x'), false, 'the secret plus one character is not');
reset role;
-- no secret stored: nothing validates, and the generator makes one again
delete from vault.secrets where name = 'cron_secret';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.cron_secret_valid(repeat('0', 64)), false, 'with no secret stored the answer is false');
select is(public.cron_secret_valid(current_setting('tests.cron_secret')), false, 'also for the old one');
reset role;
select lives_ok($$ select public.ensure_cron_secret() $$, 'the generator recreates a missing secret');
select is((select count(*)::int from vault.secrets where name = 'cron_secret'), 1, 'one secret again');
select isnt((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), current_setting('tests.cron_secret'),
  'and it is a new random value');
select is((select count(*)::int from vault.secrets where name = 'app_url'), 0, 'app_url is not created by the migration');

-- ============================================================ H8 unread notifications index
select ok((select indexdef ~ '\(user_id\)' and indexdef ~* 'where \(?read_at is null\)?' from pg_indexes
  where schemaname = 'public' and indexname = 'notifications_unread_idx'), 'a partial index on unread notifications per user');

select * from finish();
rollback;
