begin;
-- v4 logs (0018): time, pomodoro blocks, watch titles and entries, quantity sums and cardio
-- outings, plus the habit columns and guards behind them.
create extension if not exists pgtap with schema extensions;
select plan(197);

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
-- true when the statement is refused with 42501 (insufficient privilege)
create function tests.denied(q text) returns boolean language plpgsql as $f$
begin
  execute q;
  return false;
exception
  when insufficient_privilege then return true;
  when others then return false;
end $f$;
-- rows touched by a DML statement
create function tests.affected(q text) returns int language plpgsql as $f$
declare c int;
begin
  execute q;
  get diagnostics c = row_count;
  return c;
end $f$;
grant usage on schema tests to authenticated, anon;
grant execute on function tests.n(text), tests.today(), tests.denied(text), tests.affected(text) to authenticated, anon;

-- A and B are accepted friends.
insert into auth.users (id) values
  ('a1800000-0000-0000-0000-000000000001'),
  ('a1800000-0000-0000-0000-000000000002');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a1800000-0000-0000-0000-000000000001', 'v4_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a1800000-0000-0000-0000-000000000002', 'v4_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago');
insert into public.friendships (requester_id, addressee_id, status) values
  ('a1800000-0000-0000-0000-000000000001', 'a1800000-0000-0000-0000-000000000002', 'accepted');

-- keys of the public profile before anything of v4 is used (the migration already ran, but it
-- never touches public_profile(); the habit list is public so the habit keys show up too)
insert into public.habits (id, user_id, name, icon, frequency_type, target_per_week, visibility, preset, log_type,
                           quantity_unit, quantity_target, quantity_step, quantity_display, glass_ml, requires_photo) values
  ('b1800000-0000-0000-0000-000000000001', 'a1800000-0000-0000-0000-000000000001', 'Estudiar', 'book', 'daily', null, 'public', 'study', 'time', null, null, null, 'base', 250, false),
  ('b1800000-0000-0000-0000-000000000002', 'a1800000-0000-0000-0000-000000000001', 'Series', 'television', 'daily', null, 'friends', 'watch', 'watch', null, null, null, 'base', 250, false),
  ('b1800000-0000-0000-0000-000000000003', 'a1800000-0000-0000-0000-000000000001', 'Agua', 'drop', 'daily', null, 'friends', 'water', 'quantity', 'ml', 2000, 250, 'glasses', 250, false),
  ('b1800000-0000-0000-0000-000000000004', 'a1800000-0000-0000-0000-000000000001', 'Trotar', 'sneaker-move', 'weekly', 3, 'friends', 'run', 'cardio', null, null, null, 'base', 250, false),
  ('b1800000-0000-0000-0000-000000000005', 'a1800000-0000-0000-0000-000000000001', 'Ver con foto', 'television', 'daily', null, 'friends', null, 'watch', null, null, null, 'base', 250, true),
  ('b1800000-0000-0000-0000-000000000006', 'a1800000-0000-0000-0000-000000000002', 'Estudiar B', 'book', 'daily', null, 'friends', 'study', 'time', null, null, null, 'base', 250, false);

-- habits that existed before 0018 with the study preset: one plain, one with an active step
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, preset) values
  ('b1800000-0000-0000-0000-000000000007', 'a1800000-0000-0000-0000-000000000001', 'Estudiar viejo', 'book', 'daily', 'friends', 'study'),
  ('b1800000-0000-0000-0000-000000000008', 'a1800000-0000-0000-0000-000000000001', 'Estudiar con pasos', 'book', 'daily', 'friends', 'study');
insert into public.habit_items (habit_id, user_id, label, position) values
  ('b1800000-0000-0000-0000-000000000008', 'a1800000-0000-0000-0000-000000000001', 'Leer apuntes', 0);

-- an active challenge A vs B over Agua
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on) values
  ('c1800000-0000-0000-0000-000000000010', 'a1800000-0000-0000-0000-000000000001', 'a1800000-0000-0000-0000-000000000002',
   'b1800000-0000-0000-0000-000000000003', 'b1800000-0000-0000-0000-000000000006', 'daily', null, false, 4, 1000,
   'America/Santiago', 'active', tests.today());

-- a custom-unit quantity habit of A in an active challenge too, and a habit with an active step
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, log_type, quantity_unit, quantity_label, quantity_target, quantity_step) values
  ('b1800000-0000-0000-0000-000000000009', 'a1800000-0000-0000-0000-000000000001', 'Páginas', 'book', 'daily', 'friends', 'quantity', 'custom', 'páginas', 10, 1);
insert into public.habits (id, user_id, name, icon, frequency_type, visibility) values
  ('b1800000-0000-0000-0000-00000000000a', 'a1800000-0000-0000-0000-000000000001', 'Con pasos', 'book', 'daily', 'friends');
insert into public.habit_items (id, habit_id, user_id, label, position) values
  ('11800000-0000-0000-0000-000000000001', 'b1800000-0000-0000-0000-00000000000a', 'a1800000-0000-0000-0000-000000000001', 'Paso', 0);
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on) values
  ('c1800000-0000-0000-0000-000000000011', 'a1800000-0000-0000-0000-000000000001', 'a1800000-0000-0000-0000-000000000002',
   'b1800000-0000-0000-0000-000000000009', 'b1800000-0000-0000-0000-000000000006', 'daily', null, false, 4, 1000,
   'America/Santiago', 'active', tests.today());

-- titles: A has a series and a movie, B has one
insert into public.media_items (id, user_id, title, kind, total_seasons, total_episodes, runtime_min) values
  ('d1800000-0000-0000-0000-000000000001', 'a1800000-0000-0000-0000-000000000001', 'Dark', 'series', 3, 26, null),
  ('d1800000-0000-0000-0000-000000000002', 'a1800000-0000-0000-0000-000000000001', 'Dune', 'movie', null, null, 155),
  ('d1800000-0000-0000-0000-000000000003', 'a1800000-0000-0000-0000-000000000002', 'Cosa de B', 'movie', null, null, 90);
-- a past check-in of the watch habit (the entry date must come from it, not from today)
insert into public.checkins (id, habit_id, user_id, local_date) values
  ('e1800000-0000-0000-0000-000000000001', 'b1800000-0000-0000-0000-000000000002', 'a1800000-0000-0000-0000-000000000001', '2026-01-15'),
  ('e1800000-0000-0000-0000-000000000002', 'b1800000-0000-0000-0000-000000000006', 'a1800000-0000-0000-0000-000000000002', '2026-01-15');

-- ============================================================ schema (as postgres)
select ok((select bool_and(has_table_privilege('service_role', 'public.' || t, 'DELETE'))
           from unnest(array['time_entries', 'pomodoro_blocks', 'media_items', 'watch_entries', 'quantity_entries', 'cardio_entries']) t),
  'service_role can delete from the six new tables');
select ok(not has_table_privilege('authenticated', 'public.pomodoro_blocks', 'SELECT'),
  'clients cannot read pomodoro_blocks');
select ok((select bool_and(not has_table_privilege('anon', 'public.' || t, 'SELECT'))
           from unnest(array['time_entries', 'pomodoro_blocks', 'media_items', 'watch_entries', 'quantity_entries', 'cardio_entries']) t),
  'anon has no privileges on the new tables');
select ok((select bool_and(relrowsecurity) from pg_class
           where oid = any(array['public.time_entries'::regclass, 'public.pomodoro_blocks'::regclass, 'public.media_items'::regclass,
                                 'public.watch_entries'::regclass, 'public.quantity_entries'::regclass, 'public.cardio_entries'::regclass])),
  'RLS is enabled on the six new tables');
select is((select array_agg(policyname::text order by policyname) from pg_policies
           where schemaname = 'public' and tablename in ('time_entries', 'pomodoro_blocks', 'media_items', 'watch_entries', 'quantity_entries', 'cardio_entries')),
  array['cardio_entries_select_owner', 'media_items_delete_owner', 'media_items_insert_owner', 'media_items_select_owner',
        'media_items_update_owner', 'quantity_entries_select_owner', 'time_entries_select_owner', 'watch_entries_select_owner'],
  'only the owner policies exist (none on pomodoro_blocks)');
select is((select count(*)::int from pg_trigger where tgname in (
    'time_entries_forbid_deleted_actor', 'pomodoro_blocks_forbid_deleted_actor', 'media_items_forbid_deleted_actor',
    'watch_entries_forbid_deleted_actor', 'quantity_entries_forbid_deleted_actor', 'cardio_entries_forbid_deleted_actor')), 6,
  'the deleted-actor guard is on the six tables');
select is((select count(*)::int from pg_indexes where schemaname = 'public' and indexname in (
    'time_entries_user_date_idx', 'pomodoro_blocks_user_date_idx', 'pomodoro_blocks_user_created_idx', 'watch_entries_user_date_idx',
    'watch_entries_media_idx', 'quantity_entries_user_date_idx', 'quantity_entries_habit_date_idx',
    'cardio_entries_user_date_idx', 'cardio_entries_checkin_idx')), 9,
  'the lookup indexes exist');
select ok((select bool_and(not has_function_privilege('anon', f, 'EXECUTE') and has_function_privilege('authenticated', f, 'EXECUTE'))
           from unnest(array[
             'public.add_time(uuid,int,text)', 'public.add_pomodoro_block(uuid,uuid,int,text)', 'public.set_time_entry(uuid,int,text)',
             'public.delete_time_entry(uuid)', 'public.save_watch_entry(uuid,uuid,int,int,int,int,boolean,boolean)',
             'public.delete_watch_entry(uuid)', 'public.add_quantity_entry(uuid,uuid,numeric)', 'public.remove_quantity_entry(uuid)',
             'public.add_cardio_entry(uuid,text,int,int,int,text)', 'public.update_cardio_entry(uuid,text,int,int,int,text)',
             'public.delete_cardio_entry(uuid)']) f),
  'the eleven RPCs run for authenticated and not for anon');

-- the backfill statement of 0018, run over habits that predate it
update public.habits set log_type = 'time'
where preset = 'study' and log_type = 'none' and not requires_photo
  and not exists (select 1 from public.habit_items i where i.habit_id = habits.id and i.archived_at is null);
select is((select log_type from public.habits where id = 'b1800000-0000-0000-0000-000000000007'), 'time',
  'a plain Estudiar habit becomes time');
select is((select log_type from public.habits where id = 'b1800000-0000-0000-0000-000000000008'), 'none',
  'an Estudiar habit with steps stays none');
select is((select log_type from public.habits where id = 'b1800000-0000-0000-0000-000000000003'), 'quantity',
  'Agua keeps what it was created with');

select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'pomodoro_blocks_checkin_idx'),
  'pomodoro_blocks.checkin_id is indexed (the set-null cascade of every check-in delete)');
select ok(not (select prosecdef from pg_proc where oid = 'public.habits_log_photo()'::regprocedure),
  'habits_log_photo does not need SECURITY DEFINER');
select ok(pg_get_functiondef('public.add_pomodoro_block(uuid,uuid,int,text)'::regprocedure) ~ 't\.user_id = v_uid and t\.habit_id',
  'the pomodoro retry lookup filters by user (it uses the user/date index)');
select is((select array_agg(public.habit_preset_color(p) order by p) from unnest(array['watch', 'run', 'water', 'zzz']) p),
  array['durazno', 'rosa', 'cielo', 'indigo'], 'the new presets have their palette color (run durazno, watch rosa)');

-- ============================================================ habits: shape and guards (as postgres)
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity') $$,
  '23514', null, 'a quantity habit needs its unit, target and step');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_target, quantity_step)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'none', 'ml', 2000, 250) $$,
  '23514', null, 'only a quantity habit carries quantity columns');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, requires_photo)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'book', 'daily', 'time', true) $$,
  'P0001', 'photo_conflict', 'a time habit cannot require a photo');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, requires_photo, quantity_unit, quantity_target, quantity_step)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity', true, 'ml', 2000, 250) $$,
  'P0001', 'photo_conflict', 'a quantity habit cannot require a photo');
select throws_ok($$ update public.habits set requires_photo = true where id = 'b1800000-0000-0000-0000-000000000001' $$,
  'P0001', 'photo_conflict', 'a time habit cannot start requiring a photo');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_target, quantity_step)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity', 'custom', 10, 1) $$,
  '23514', null, 'a custom unit needs a label');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_label, quantity_target, quantity_step)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity', 'ml', 'vasos', 2000, 250) $$,
  '23514', null, 'a label only goes with the custom unit');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_label, quantity_target, quantity_step)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity', 'custom', 'una etiqueta larga', 10, 1) $$,
  '23514', null, 'a label has at most 12 characters');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_target, quantity_step, quantity_display)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity', 'steps', 8000, 1000, 'glasses') $$,
  '23514', null, 'glasses only go with ml');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_target, quantity_step)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity', 'steps', 8000.5, 1000) $$,
  '23514', null, 'a whole-number unit has a whole target');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_target, quantity_step)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity', 'steps', 8000, 9000) $$,
  '23514', null, 'the step cannot pass the target');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_target, quantity_step)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity', 'ml', 100001, 250) $$,
  '23514', null, 'a target has at most 100000');
select throws_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_target, quantity_step, glass_ml)
  values ('a1800000-0000-0000-0000-000000000001', 'X', 'drop', 'daily', 'quantity', 'ml', 2000, 250, 20) $$,
  '23514', null, 'a glass holds 50 to 1000 ml');
select lives_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_target, quantity_step)
  values ('a1800000-0000-0000-0000-000000000001', 'Km', 'sneaker-move', 'daily', 'quantity', 'km', 7.5, 0.5) $$,
  'km takes decimals');
select throws_ok($$ update public.habits set log_type = 'yoga' where id = 'b1800000-0000-0000-0000-000000000001' $$,
  '23514', null, 'log_type only accepts the seven types');
select lives_ok($$ insert into public.habits (user_id, name, icon, frequency_type, preset)
  values ('a1800000-0000-0000-0000-000000000001', 'Preset serie', 'television', 'daily', 'watch') $$,
  'the watch preset is accepted');
select lives_ok($$ insert into public.habits (user_id, name, icon, frequency_type, preset)
  values ('a1800000-0000-0000-0000-000000000001', 'Preset trote', 'sneaker-move', 'daily', 'run') $$,
  'the run preset is accepted');
select throws_ok($$ insert into public.habit_items (habit_id, user_id, label, position)
  values ('b1800000-0000-0000-0000-000000000001', 'a1800000-0000-0000-0000-000000000001', 'Paso', 0) $$,
  'P0001', 'items_with_log', 'an active step cannot go on a habit with a detailed log');
select throws_ok($$ insert into public.habit_items (habit_id, user_id, label, position)
  values ('b1800000-0000-0000-0000-000000000003', 'a1800000-0000-0000-0000-000000000001', 'Paso', 0) $$,
  'P0001', 'items_with_log', 'nor on a quantity habit');
select lives_ok($$ insert into public.habit_items (habit_id, user_id, label, position)
  select h.id, h.user_id, 'Paso', 0 from public.habits h where h.name = 'Preset serie' $$,
  'steps still go on a habit without a detailed log');

-- ============================================================ time (A)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq($$ select total_minutes, checkin_created from public.add_time('b1800000-0000-0000-0000-000000000001', 85, 'Álgebra') $$,
  $$ values (85, true) $$, 'add_time creates the check-in and the first 85 minutes');
select is((select te.checkin_id from public.time_entries te where te.habit_id = 'b1800000-0000-0000-0000-000000000001'),
  (select c.id from public.checkins c where c.habit_id = 'b1800000-0000-0000-0000-000000000001' and c.local_date = tests.today()),
  'the entry hangs from the check-in of today');
select results_eq($$ select total_minutes, checkin_created from public.add_time('b1800000-0000-0000-0000-000000000001', 30, null) $$,
  $$ values (115, false) $$, 'add_time adds up on the same check-in');
select is((select topic from public.time_entries where habit_id = 'b1800000-0000-0000-0000-000000000001'), 'Álgebra',
  'a null topic keeps the topic');
select throws_ok($$ select * from public.add_time('b1800000-0000-0000-0000-000000000001', 0) $$, 'P0001', 'invalid_minutes', 'zero minutes');
select throws_ok($$ select * from public.add_time('b1800000-0000-0000-0000-000000000001', 1400) $$, 'P0001', 'minutes_over_day', 'a day has at most 1440 minutes');
select is((select minutes from public.time_entries where habit_id = 'b1800000-0000-0000-0000-000000000001'), 115, 'the total did not change');
select throws_ok($$ select * from public.add_time('b1800000-0000-0000-0000-000000000002', 10) $$, 'P0001', 'log_type_mismatch', 'a watch habit takes no time');
select throws_ok($$ select * from public.add_time('b1800000-0000-0000-0000-000000000006', 10) $$, 'P0001', 'habit_not_found', 'the habit of B is not found');
select throws_ok($$ select * from public.add_time('b1800000-0000-0000-0000-000000000001', 5, repeat('x', 61)) $$, 'P0001', 'invalid_topic', 'a topic has at most 60 characters');
select throws_ok($$ select * from public.add_time(null, 5) $$, 'P0001', 'habit_not_found', 'no habit, no time');

-- ============================================================ pomodoro (A)
select results_eq($$ select total_minutes, credited, checkin_created from public.add_pomodoro_block(
    'b1800000-0000-0000-0000-000000000001', '51800000-0000-0000-0000-0000000000b1', 25) $$,
  $$ values (140, true, false) $$, 'a block is credited once');
select is((select pomodoros::int from public.time_entries where habit_id = 'b1800000-0000-0000-0000-000000000001'), 1, 'one pomodoro counted');
select results_eq($$ select total_minutes, credited from public.add_pomodoro_block(
    'b1800000-0000-0000-0000-000000000001', '51800000-0000-0000-0000-0000000000b1', 25) $$,
  $$ values (140, false) $$, 'the same block is not credited twice');
select is((select pomodoros::int from public.time_entries where habit_id = 'b1800000-0000-0000-0000-000000000001'), 1, 'still one pomodoro');
select throws_ok($$ select * from public.add_pomodoro_block('b1800000-0000-0000-0000-000000000001', '51800000-0000-0000-0000-0000000000b2', 91) $$,
  'P0001', 'invalid_minutes', 'a block lasts at most 90 minutes');
reset role;
select is((select count(*)::int from public.pomodoro_blocks where block_id = '51800000-0000-0000-0000-0000000000b2'), 0,
  'a refused block leaves no receipt');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- undo the check-in of today: the time goes, the receipt stays
delete from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000001' and local_date = tests.today();
select is(tests.n($$ select 1 from public.time_entries where habit_id = 'b1800000-0000-0000-0000-000000000001' $$), 0, 'undoing the check-in deletes its time');
reset role;
select is((select checkin_id from public.pomodoro_blocks where block_id = '51800000-0000-0000-0000-0000000000b1'), null,
  'the receipt of the block stays, without check-in');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq($$ select total_minutes, credited, checkin_created from public.add_pomodoro_block(
    'b1800000-0000-0000-0000-000000000001', '51800000-0000-0000-0000-0000000000b1', 25) $$,
  $$ values (0, false, false) $$, 'a late retry of the block credits nothing');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000001' and local_date = tests.today() $$), 0,
  'and it does not mark the day again');
select results_eq($$ select total_minutes, credited, checkin_created from public.add_pomodoro_block(
    'b1800000-0000-0000-0000-000000000001', '51800000-0000-0000-0000-0000000000b3', 25) $$,
  $$ values (25, true, true) $$, 'a new block marks the day again');
select throws_ok($$ select * from public.add_pomodoro_block('b1800000-0000-0000-0000-000000000002', '51800000-0000-0000-0000-0000000000b4', 25) $$,
  'P0001', 'log_type_mismatch', 'a block needs a time habit');

-- set / delete the day
select lives_ok($$ select * from public.add_time('b1800000-0000-0000-0000-000000000001', 5, 'Tema') $$, 'a topic is set');
select ok(public.set_time_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000001' and local_date = tests.today()), 60, '') is not null,
  'set_time_entry returns the entry id');
select is((select minutes from public.time_entries where habit_id = 'b1800000-0000-0000-0000-000000000001'), 60, 'set_time_entry fixes the total');
select is((select topic from public.time_entries where habit_id = 'b1800000-0000-0000-0000-000000000001'), null, 'an empty topic clears it');
select is((select pomodoros::int from public.time_entries where habit_id = 'b1800000-0000-0000-0000-000000000001'), 1, 'the pomodoros are kept');
select throws_ok($$ select public.set_time_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000001' and local_date = tests.today()), 1441, null) $$,
  'P0001', 'invalid_minutes', 'set_time_entry caps the day');
select throws_ok($$ select public.set_time_entry('e1800000-0000-0000-0000-000000000002', 10, null) $$,
  'P0001', 'checkin_not_found', 'the check-in of B is not found');
select throws_ok($$ select public.set_time_entry('e1800000-0000-0000-0000-000000000001', 10, null) $$,
  'P0001', 'log_type_mismatch', 'a watch check-in takes no time');
select lives_ok($$ select public.delete_time_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000001' and local_date = tests.today())) $$,
  'delete_time_entry runs');
select is(tests.n($$ select 1 from public.time_entries where habit_id = 'b1800000-0000-0000-0000-000000000001' $$), 0, 'the entry is gone');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000001' and local_date = tests.today() $$), 1,
  'and the check-in stays');

-- B cannot use the block id of A
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select * from public.add_pomodoro_block('b1800000-0000-0000-0000-000000000006', '51800000-0000-0000-0000-0000000000b1', 25) $$,
  'P0001', 'invalid_block', 'a block of someone else is invalid');
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- ============================================================ watch (A)
select ok(public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000001', 3, 1, 3, null, false) is not null,
  'save_watch_entry stores a series entry');
select is((select local_date from public.watch_entries where checkin_id = 'e1800000-0000-0000-0000-000000000001'), '2026-01-15'::date,
  'the date comes from the check-in');
select throws_ok($$ select public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000001', null, 1, 3, null, false) $$,
  'P0001', 'invalid_watch', 'a series entry needs episodes');
select throws_ok($$ select public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000001', 2, 4, 3, null, false) $$,
  'P0001', 'invalid_watch', 'the season cannot pass the seasons of the series');
select throws_ok($$ select public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000001', 2, 1, 3, null, true) $$,
  'P0001', 'invalid_watch', 'a series entry is never completed');
select ok(public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000001', 2, 1, 5, 110, false) is not null,
  'saving again updates the entry');
select is(tests.n($$ select 1 from public.watch_entries where checkin_id = 'e1800000-0000-0000-0000-000000000001' and episodes = 2 and minutes = 110 $$), 1,
  'one row per check-in, with the new values');
select is((select status from public.media_items where id = 'd1800000-0000-0000-0000-000000000001'), 'watching', 'the series is still being watched');
select ok(public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000002', null, null, null, null, true) is not null,
  'a movie watched complete is saved');
select is((select finished_on from public.media_items where id = 'd1800000-0000-0000-0000-000000000002'), '2026-01-15'::date,
  'the movie is finished on the date of the check-in');
select is((select status from public.media_items where id = 'd1800000-0000-0000-0000-000000000002'), 'finished', 'and its status is finished');
select throws_ok($$ select public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000002', 2, null, null, null, false) $$,
  'P0001', 'invalid_watch', 'a movie has no episodes');
select throws_ok($$ select public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000002', null, null, null, null, false) $$,
  'P0001', 'invalid_watch', 'a movie needs minutes or to be completed');
select throws_ok($$ select public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000003', null, null, null, 10, false) $$,
  'P0001', 'media_not_found', 'the title of B is not found');
select throws_ok($$ select public.save_watch_entry('e1800000-0000-0000-0000-000000000002', 'd1800000-0000-0000-0000-000000000001', 1, null, null, null, false) $$,
  'P0001', 'checkin_not_found', 'the check-in of B is not found');
select throws_ok($$ select public.save_watch_entry(null, 'd1800000-0000-0000-0000-000000000001', 1, null, null, null, false) $$,
  'P0001', 'checkin_not_found', 'no check-in');
select ok(public.save_watch_entry('e1800000-0000-0000-0000-000000000001', 'd1800000-0000-0000-0000-000000000001', 1, 3, 26, null, false, true) is not null,
  'a series can be finished with the entry');
select is((select status from public.media_items where id = 'd1800000-0000-0000-0000-000000000001'), 'finished', 'the series is finished');
select throws_ok($$ update public.media_items set kind = 'series' where id = 'd1800000-0000-0000-0000-000000000002' $$,
  '42501', null, 'the kind of a title never changes');
select lives_ok($$ select public.delete_watch_entry('e1800000-0000-0000-0000-000000000001') $$, 'delete_watch_entry runs');
select is(tests.n($$ select 1 from public.watch_entries $$), 0, 'the entry is gone');
select is(tests.n($$ select 1 from public.checkins where id = 'e1800000-0000-0000-0000-000000000001' $$), 1, 'the check-in stays');

-- saving a finished title again with another day moves finished_on (documented behaviour)
reset role;
insert into public.checkins (id, habit_id, user_id, local_date) values
  ('e1800000-0000-0000-0000-000000000003', 'b1800000-0000-0000-0000-000000000002', 'a1800000-0000-0000-0000-000000000001', '2026-01-20');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(public.save_watch_entry('e1800000-0000-0000-0000-000000000003', 'd1800000-0000-0000-0000-000000000002', null, null, null, null, true) is not null,
  'a finished movie is saved complete again on another day');
select is((select finished_on from public.media_items where id = 'd1800000-0000-0000-0000-000000000002'), '2026-01-20'::date,
  'finished_on follows the latest completed entry');
select lives_ok($$ select public.delete_watch_entry('e1800000-0000-0000-0000-000000000003') $$, 'deleting that entry does not fail');
select is((select status from public.media_items where id = 'd1800000-0000-0000-0000-000000000002'), 'finished',
  'and the title stays finished');

-- the titles of A (RLS and grants)
select lives_ok($$ insert into public.media_items (user_id, title, kind, runtime_min)
  values ('a1800000-0000-0000-0000-000000000001', 'Past Lives', 'movie', 106) $$, 'A adds a movie');
select throws_ok($$ insert into public.media_items (user_id, title, kind, runtime_min)
  values ('a1800000-0000-0000-0000-000000000002', 'Ajena', 'movie', 106) $$, '42501', null, 'A cannot add a title for B');
select throws_ok($$ insert into public.media_items (user_id, title, kind, runtime_min)
  values ('a1800000-0000-0000-0000-000000000001', 'Serie con duración', 'series', 40) $$, '23514', null, 'a series has no runtime');
select throws_ok($$ insert into public.media_items (user_id, title, kind, total_seasons)
  values ('a1800000-0000-0000-0000-000000000001', 'Película con temporadas', 'movie', 2) $$, '23514', null, 'a movie has no seasons');
select throws_ok($$ insert into public.media_items (user_id, title, kind, status, finished_on)
  values ('a1800000-0000-0000-0000-000000000001', 'Con estado', 'movie', 'finished', '2026-01-01') $$, '42501', null, 'status is not set on insert');
select throws_ok($$ update public.media_items set status = 'finished' where title = 'Past Lives' $$,
  '23514', null, 'finished needs finished_on');
select throws_ok($$ update public.media_items set status = 'finished', finished_on = (tests.today() + 1) where title = 'Past Lives' $$,
  '23514', 'invalid_finished_on', 'a title is never finished in the future');
select lives_ok($$ update public.media_items set status = 'finished', finished_on = '2026-01-02' where title = 'Past Lives' $$, 'A finishes a title');
select is(tests.n($$ select 1 from public.media_items $$), 3, 'A sees only the titles of A');
select lives_ok($$ delete from public.media_items where title = 'Past Lives' $$, 'A deletes a title');

-- ============================================================ quantity (A)
select results_eq($$ select total, target, done, created from public.add_quantity_entry(
    'b1800000-0000-0000-0000-000000000003', '91800000-0000-0000-0000-0000000000a1', 1500) $$,
  $$ values (1500::numeric, 2000::numeric, false, true) $$, 'the first sum is below the goal');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' $$), 0, 'no check-in below the goal');
select results_eq($$ select total, target, done, created from public.add_quantity_entry(
    'b1800000-0000-0000-0000-000000000003', '91800000-0000-0000-0000-0000000000a1', 1500) $$,
  $$ values (1500::numeric, 2000::numeric, false, false) $$, 'the same entry id adds nothing');
select results_eq($$ select total, target, done, created from public.add_quantity_entry(
    'b1800000-0000-0000-0000-000000000003', '91800000-0000-0000-0000-0000000000a2', 500) $$,
  $$ values (2000::numeric, 2000::numeric, true, true) $$, 'reaching the goal is done');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' and local_date = tests.today() $$), 1,
  'the goal creates the check-in of today');
select throws_ok($$ select * from public.add_quantity_entry('b1800000-0000-0000-0000-000000000003', '91800000-0000-0000-0000-0000000000a3', 12.5) $$,
  'P0001', 'invalid_amount', 'ml is a whole number');
select throws_ok($$ select * from public.add_quantity_entry('b1800000-0000-0000-0000-000000000003', '91800000-0000-0000-0000-0000000000a3', 0) $$,
  'P0001', 'invalid_amount', 'an amount is positive');
select throws_ok($$ select * from public.add_quantity_entry('b1800000-0000-0000-0000-000000000003', '91800000-0000-0000-0000-0000000000a3', 100001) $$,
  'P0001', 'invalid_amount', 'an amount has at most 100000');
select throws_ok($$ select * from public.add_quantity_entry('b1800000-0000-0000-0000-000000000003', '91800000-0000-0000-0000-0000000000a3', 99000) $$,
  'P0001', 'amount_over_day', 'a day has at most 100000');
select throws_ok($$ select * from public.add_quantity_entry('b1800000-0000-0000-0000-000000000001', '91800000-0000-0000-0000-0000000000a3', 10) $$,
  'P0001', 'log_type_mismatch', 'a time habit takes no quantity');
select throws_ok($$ select * from public.add_quantity_entry('b1800000-0000-0000-0000-000000000006', '91800000-0000-0000-0000-0000000000a3', 10) $$,
  'P0001', 'habit_not_found', 'the habit of B is not found');
select results_eq($$ select total, target, done from public.remove_quantity_entry('91800000-0000-0000-0000-0000000000a2') $$,
  $$ values (1500::numeric, 2000::numeric, false) $$, 'removing the last sum goes under the goal');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' and local_date = tests.today() $$), 0,
  'and the check-in of today goes away');
select results_eq($$ select total, target, done, created from public.add_quantity_entry(
    'b1800000-0000-0000-0000-000000000003', '91800000-0000-0000-0000-0000000000a4', 500) $$,
  $$ values (2000::numeric, 2000::numeric, true, true) $$, 'adding again completes the day again');
select throws_ok($$ delete from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' $$,
  'P0001', 'quantity_checkin_managed', 'a client cannot delete the check-in of a quantity habit');
select throws_ok($$ select * from public.create_checkin('b1800000-0000-0000-0000-000000000003') $$,
  'P0001', 'quantity_habit', 'create_checkin refuses a quantity habit');

-- a closed period of the challenge that includes today: the check-in stays
reset role;
insert into public.challenge_periods (challenge_id, period_start, period_end, closed_at)
values ('c1800000-0000-0000-0000-000000000010', tests.today() - 3, tests.today() + 3, now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq($$ select total, target, done from public.remove_quantity_entry('91800000-0000-0000-0000-0000000000a4') $$,
  $$ values (1500::numeric, 2000::numeric, true) $$, 'in a closed period the check-in stays');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' and local_date = tests.today() $$), 1,
  'the check-in is still there');
reset role;
delete from public.challenge_periods where challenge_id = 'c1800000-0000-0000-0000-000000000010';
insert into public.quantity_entries (id, user_id, habit_id, local_date, amount)
values ('91800000-0000-0000-0000-0000000000a5', 'a1800000-0000-0000-0000-000000000001', 'b1800000-0000-0000-0000-000000000003', tests.today() - 1, 100);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select * from public.remove_quantity_entry('91800000-0000-0000-0000-0000000000a5') $$,
  'P0001', 'entry_not_today', 'only the sums of today can be removed');
select throws_ok($$ select * from public.remove_quantity_entry('91800000-0000-0000-0000-0000000000ff') $$,
  'P0001', 'entry_not_found', 'an unknown sum is not found');

-- a sum id of someone else
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select * from public.remove_quantity_entry('91800000-0000-0000-0000-0000000000a1') $$,
  'P0001', 'entry_not_found', 'B cannot remove a sum of A');
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- an entry id of another habit of mine is not a retry of this one
select throws_ok($$ select * from public.add_quantity_entry((select id from public.habits where name = 'Km'),
  '91800000-0000-0000-0000-0000000000a1', 1) $$, 'P0001', 'invalid_entry', 'a retry must be for the same habit');
-- a habit that stopped being quantity cannot have its sums removed
reset role;
insert into public.quantity_entries (id, user_id, habit_id, local_date, amount)
select '91800000-0000-0000-0000-0000000000a6', h.user_id, h.id, tests.today(), 1 from public.habits h where h.name = 'Km';
update public.habits set log_type = 'none', quantity_unit = null, quantity_target = null, quantity_step = null where name = 'Km';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select * from public.remove_quantity_entry('91800000-0000-0000-0000-0000000000a6') $$,
  'P0001', 'log_type_mismatch', 'remove_quantity_entry needs a quantity habit');

-- guards while the challenge is active
select throws_ok($$ update public.habits set quantity_target = 1500 where id = 'b1800000-0000-0000-0000-000000000003' $$,
  'P0001', 'habit_in_challenge', 'the goal cannot go down in a challenge');
select throws_ok($$ update public.habits set quantity_unit = 'steps' where id = 'b1800000-0000-0000-0000-000000000003' $$,
  'P0001', 'habit_in_challenge', 'the unit cannot change in a challenge');
select lives_ok($$ update public.habits set quantity_target = 2500 where id = 'b1800000-0000-0000-0000-000000000003' $$,
  'the goal can go up in a challenge');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' and local_date = tests.today() $$), 1,
  'raising the goal does not delete the check-in');
select lives_ok($$ update public.habits set quantity_display = 'base', glass_ml = 300 where id = 'b1800000-0000-0000-0000-000000000003' $$,
  'the view and the glass can change in a challenge');

-- without a challenge: lowering the goal under the total creates the check-in
reset role;
update public.challenges set status = 'cancelled' where id = 'c1800000-0000-0000-0000-000000000010';
delete from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' and local_date = tests.today();
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' and local_date = tests.today() $$), 0,
  'no check-in before lowering the goal');
select lives_ok($$ update public.habits set quantity_target = 1000 where id = 'b1800000-0000-0000-0000-000000000003' $$,
  'the goal goes down without a challenge');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' and local_date = tests.today() $$), 1,
  'the new goal is under the total: the check-in appears');

-- steps and a detailed log never go together, in any order (a day by steps would create and
-- delete the check-in of a quantity habit without its goal)
select throws_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b1800000-0000-0000-0000-00000000000a' $$,
  'P0001', 'items_with_log', 'a habit with active steps cannot become quantity');
select throws_ok($$ update public.habits set log_type = 'time' where id = 'b1800000-0000-0000-0000-00000000000a' $$,
  'P0001', 'items_with_log', 'nor time');
select throws_ok($$ update public.habits set log_type = 'cardio' where id = 'b1800000-0000-0000-0000-00000000000a' $$,
  'P0001', 'items_with_log', 'nor any other detailed log');
select lives_ok($$ update public.habits set log_type = 'none' where id = 'b1800000-0000-0000-0000-00000000000a' $$,
  'a habit with steps can keep none');
reset role;
update public.habit_items set archived_at = now() where id = '11800000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b1800000-0000-0000-0000-00000000000a' $$, 'with the step archived the habit can become quantity');
select throws_ok($$ update public.habit_items set archived_at = null where id = '11800000-0000-0000-0000-000000000001' $$,
  'P0001', 'items_with_log', 'the archived step cannot be activated again');
select throws_ok($$ select * from public.check_item('11800000-0000-0000-0000-000000000001') $$,
  'P0001', 'item_not_found', 'check_item cannot complete the day of a quantity habit');
reset role;
insert into public.checkins (habit_id, user_id, local_date)
values ('b1800000-0000-0000-0000-00000000000a', 'a1800000-0000-0000-0000-000000000001', tests.today());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.uncheck_item('11800000-0000-0000-0000-000000000001') $$,
  'P0001', 'quantity_habit', 'uncheck_item cannot delete the check-in of a quantity habit');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-00000000000a' $$), 1, 'the check-in is still there');

-- more guard branches in a challenge (custom label, leaving quantity)
select throws_ok($$ update public.habits set quantity_label = 'hojas' where id = 'b1800000-0000-0000-0000-000000000009' $$,
  'P0001', 'habit_in_challenge', 'the label cannot change in a challenge');
select throws_ok($$ update public.habits set log_type = 'none', quantity_unit = null, quantity_label = null, quantity_target = null, quantity_step = null
  where id = 'b1800000-0000-0000-0000-000000000009' $$,
  'P0001', 'habit_in_challenge', 'a challenge habit cannot leave quantity');
-- column grants of the new columns work for the owner
select lives_ok($$ insert into public.habits (user_id, name, icon, frequency_type, log_type, quantity_unit, quantity_target, quantity_step, quantity_display, glass_ml)
  values ('a1800000-0000-0000-0000-000000000001', 'Agua de A', 'drop', 'daily', 'quantity', 'ml', 2000, 250, 'glasses', 300) $$,
  'the owner creates a quantity habit through the grants');
select lives_ok($$ update public.habits set quantity_step = 500, quantity_display = 'base', glass_ml = 200 where name = 'Agua de A' $$,
  'and edits its quantity columns');
select throws_ok($$ select * from public.create_checkin('b1800000-0000-0000-0000-000000000005') $$,
  'P0001', 'photo_required', 'a watch habit with photo asks for the photo');

-- the service role (account deletion) can delete the check-in of a quantity habit
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$ delete from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003' $$,
  'service_role deletes the check-in of a quantity habit');
select is((select count(*)::int from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000003'), 0, 'and it is gone');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- ============================================================ cardio (A)
select lives_ok($$ select * from public.create_checkin('b1800000-0000-0000-0000-000000000004') $$, 'A checks in the run habit');
select ok(public.add_cardio_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' and local_date = tests.today()),
  'run', 5200, 1780) is not null, 'add_cardio_entry returns the id of a run');
select ok(public.add_cardio_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' and local_date = tests.today()),
  'swim', 1500, 1800, 3, '  piscina  ') is not null, 'and of a swim');
select is((select note from public.cardio_entries where kind = 'swim'), 'piscina', 'the note is trimmed');
select throws_ok($$ select public.add_cardio_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' and local_date = tests.today()),
  'fly', 100, 100) $$, 'P0001', 'invalid_cardio', 'an unknown kind');
select throws_ok($$ select public.add_cardio_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' and local_date = tests.today()),
  'run', 0, 100) $$, 'P0001', 'invalid_cardio', 'a distance is positive');
select throws_ok($$ select public.add_cardio_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' and local_date = tests.today()),
  'run', 100, 0) $$, 'P0001', 'invalid_cardio', 'a duration is positive');
select throws_ok($$ select public.add_cardio_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' and local_date = tests.today()),
  'run', 100, 100, 6) $$, 'P0001', 'invalid_cardio', 'the effort is 1 to 5');
select throws_ok($$ select public.add_cardio_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' and local_date = tests.today()),
  'run', 100, 100, 3, repeat('x', 61)) $$, 'P0001', 'invalid_cardio', 'a note has at most 60 characters');
select throws_ok($$ select public.add_cardio_entry('e1800000-0000-0000-0000-000000000002', 'run', 100, 100) $$,
  'P0001', 'checkin_not_found', 'the check-in of B is not found');
select throws_ok($$ select public.add_cardio_entry('e1800000-0000-0000-0000-000000000001', 'run', 100, 100) $$,
  'P0001', 'log_type_mismatch', 'a watch check-in takes no outings');
select lives_ok($$ select public.add_cardio_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' and local_date = tests.today()),
  'walk', 1000, 700) from generate_series(1, 8) $$, 'up to ten outings');
select throws_ok($$ select public.add_cardio_entry((select id from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' and local_date = tests.today()),
  'walk', 1000, 700) $$, 'P0001', 'too_many_entries', 'the eleventh outing is refused');
select lives_ok($$ select public.update_cardio_entry((select id from public.cardio_entries where kind = 'run'), 'run', 6000, 2000, 4, null) $$,
  'update_cardio_entry runs');
select is((select distance_m from public.cardio_entries where kind = 'run'), 6000, 'the outing changed');
select throws_ok($$ select public.update_cardio_entry((select id from public.cardio_entries where kind = 'run'), 'run', 0, 2000) $$,
  'P0001', 'invalid_cardio', 'update validates like add');
select throws_ok($$ select public.update_cardio_entry('f1800000-0000-0000-0000-0000000000ff', 'run', 100, 100) $$,
  'P0001', 'entry_not_found', 'an unknown outing is not found');
select lives_ok($$ select public.delete_cardio_entry((select id from public.cardio_entries where kind = 'swim')) $$, 'delete_cardio_entry runs');
select is(tests.n($$ select 1 from public.cardio_entries $$), 9, 'one outing less');
select is(tests.n($$ select 1 from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004' $$), 1, 'the check-in stays');
delete from public.checkins where habit_id = 'b1800000-0000-0000-0000-000000000004';
select is(tests.n($$ select 1 from public.cardio_entries $$), 0, 'deleting the check-in deletes its outings');

-- ============================================================ privacy
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}', true);
-- A rows that exist right now, as seen by A: refill a few so B has something to not see
reset role;
insert into public.time_entries (user_id, habit_id, checkin_id, local_date, minutes)
select 'a1800000-0000-0000-0000-000000000001', 'b1800000-0000-0000-0000-000000000001', c.id, c.local_date, 30
from public.checkins c where c.habit_id = 'b1800000-0000-0000-0000-000000000001' limit 1;
insert into public.watch_entries (user_id, habit_id, checkin_id, media_id, local_date, episodes)
values ('a1800000-0000-0000-0000-000000000001', 'b1800000-0000-0000-0000-000000000002', 'e1800000-0000-0000-0000-000000000001',
        'd1800000-0000-0000-0000-000000000001', '2026-01-15', 1);
insert into public.checkins (id, habit_id, user_id, local_date) values
  ('e1800000-0000-0000-0000-000000000004', 'b1800000-0000-0000-0000-000000000004', 'a1800000-0000-0000-0000-000000000001', tests.today());
insert into public.cardio_entries (user_id, habit_id, checkin_id, local_date, kind, distance_m, duration_s)
values ('a1800000-0000-0000-0000-000000000001', 'b1800000-0000-0000-0000-000000000004', 'e1800000-0000-0000-0000-000000000004',
        tests.today(), 'run', 1000, 400);
insert into public.quantity_entries (id, user_id, habit_id, local_date, amount)
values ('91800000-0000-0000-0000-0000000000a7', 'a1800000-0000-0000-0000-000000000001', 'b1800000-0000-0000-0000-000000000003', tests.today(), 100)
on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(tests.n($$ select 1 from public.time_entries where user_id = 'a1800000-0000-0000-0000-000000000001' $$), 0, 'B does not see the time of A');
select is(tests.n($$ select 1 from public.media_items where user_id = 'a1800000-0000-0000-0000-000000000001' $$), 0, 'B does not see the titles of A');
select is(tests.n($$ select 1 from public.watch_entries where user_id = 'a1800000-0000-0000-0000-000000000001' $$), 0, 'B does not see the watch entries of A');
select is(tests.n($$ select 1 from public.quantity_entries where user_id = 'a1800000-0000-0000-0000-000000000001' $$), 0, 'B does not see the sums of A');
select is(tests.n($$ select 1 from public.cardio_entries where user_id = 'a1800000-0000-0000-0000-000000000001' $$), 0, 'B does not see the outings of A');
select throws_ok($$ insert into public.time_entries (user_id, habit_id, checkin_id, local_date, minutes)
  values ('a1800000-0000-0000-0000-000000000002', 'b1800000-0000-0000-0000-000000000006', 'e1800000-0000-0000-0000-000000000002', '2026-01-15', 10) $$,
  '42501', null, 'a client cannot write time_entries');
select throws_ok($$ insert into public.quantity_entries (user_id, habit_id, local_date, amount)
  values ('a1800000-0000-0000-0000-000000000002', 'b1800000-0000-0000-0000-000000000006', tests.today(), 10) $$,
  '42501', null, 'a client cannot write quantity_entries');
select throws_ok($$ select * from public.pomodoro_blocks $$, '42501', null, 'a client cannot read pomodoro_blocks');
-- no direct write on any new table: the friend B, the owner A and anon (INSERT, UPDATE, DELETE)
select ok((select bool_and(tests.denied(format(q, t)))
           from unnest(array['time_entries', 'pomodoro_blocks', 'watch_entries', 'quantity_entries', 'cardio_entries']) t,
                unnest(array['insert into public.%s default values', 'update public.%s set created_at = now()', 'delete from public.%s']) q),
  'the friend cannot write the RPC-only tables');
select ok(tests.denied($$ insert into public.media_items (user_id, title, kind, runtime_min)
  values ('a1800000-0000-0000-0000-000000000001', 'Ajena', 'movie', 10) $$), 'the friend cannot add a title for A');
select is(tests.affected($$ delete from public.media_items where user_id = 'a1800000-0000-0000-0000-000000000001' $$), 0,
  'nor delete a title of A (no row is visible)');
select is(tests.affected($$ update public.media_items set title = 'x' where user_id = 'a1800000-0000-0000-0000-000000000001' $$), 0,
  'nor update it');
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok((select bool_and(tests.denied(format(q, t)))
           from unnest(array['time_entries', 'pomodoro_blocks', 'watch_entries', 'quantity_entries', 'cardio_entries']) t,
                unnest(array['insert into public.%s default values', 'update public.%s set created_at = now()', 'delete from public.%s']) q),
  'not even the owner writes the RPC-only tables directly');
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(jsonb_typeof(public.public_profile('v4_a')), 'object', 'B reads the public profile of A');
select is((select array_agg(k order by k) from jsonb_object_keys(public.public_profile('v4_a')) k),
  array['avatarPath', 'avatarPreset', 'avatarUpdatedAt', 'displayName', 'habits', 'username'], 'public_profile() keeps its keys');
select is((select array_agg(k order by k) from jsonb_object_keys(public.public_profile('v4_a') -> 'habits' -> 0) k),
  array['color', 'dates', 'frequencyType', 'icon', 'name', 'targetPerWeek'], 'and the keys of each habit');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'public_profiles'),
  array['id', 'username', 'display_name', 'avatar_path', 'avatar_preset'], 'public_profiles has the same columns');
reset role;
set local role anon;
select throws_ok($$ select * from public.media_items $$, '42501', null, 'anon cannot read titles');
select ok((select bool_and(tests.denied(format(q, t)))
           from unnest(array['time_entries', 'pomodoro_blocks', 'media_items', 'watch_entries', 'quantity_entries', 'cardio_entries']) t,
                unnest(array['insert into public.%s default values', 'update public.%s set created_at = now()', 'delete from public.%s']) q),
  'anon cannot write any new table');
reset role;

-- ============================================================ deleted account
update public.profiles set deleted_at = now() where id = 'a1800000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select * from public.add_time('b1800000-0000-0000-0000-000000000001', 10) $$, '28000', 'not_authenticated', 'a deleted account cannot add time');
select throws_ok($$ select * from public.add_quantity_entry('b1800000-0000-0000-0000-000000000003', '91800000-0000-0000-0000-0000000000a9', 10) $$,
  '28000', 'not_authenticated', 'nor quantity');
select throws_ok($$ select * from public.add_pomodoro_block('b1800000-0000-0000-0000-000000000001', '51800000-0000-0000-0000-0000000000a9', 10) $$,
  '28000', 'not_authenticated', 'nor a pomodoro block');
select throws_ok($$ insert into public.media_items (user_id, title, kind, runtime_min)
  values ('a1800000-0000-0000-0000-000000000001', 'Tarde', 'movie', 90) $$, '42501', 'not_authenticated', 'nor a title');

select * from finish();
rollback;
