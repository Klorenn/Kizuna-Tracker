begin;
-- Habit switch guards (0021): a habit in a proposed or active challenge cannot switch TO quantity, and a
-- habit with a check-in today cannot switch to or from quantity or change a quantity unit.
create extension if not exists pgtap with schema extensions;
select plan(33);

create schema tests;
create function tests.today() returns date language sql stable as $f$
  select (now() at time zone 'America/Santiago')::date
$f$;
grant usage on schema tests to authenticated;
grant execute on function tests.today() to authenticated;

insert into auth.users (id) values
  ('a2100000-0000-0000-0000-000000000001'),
  ('a2100000-0000-0000-0000-000000000002'),
  ('a2100000-0000-0000-0000-000000000003'),
  ('a2100000-0000-0000-0000-000000000004');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a2100000-0000-0000-0000-000000000001', 'sg_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a2100000-0000-0000-0000-000000000002', 'sg_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago'),
  -- one open challenge per pair: C is the rival of the proposed one, D of the active quantity one
  ('a2100000-0000-0000-0000-000000000003', 'sg_c', 'C', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a2100000-0000-0000-0000-000000000004', 'sg_d', 'D', 'Test', '1990-01-01', now(), 'America/Santiago');

-- habits of A (ids b21...NN); B owns the rival habits
insert into public.habits (id, user_id, name, icon, frequency_type, visibility) values
  ('b2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', 'Libre', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000001', 'En reto activo', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-000000000003', 'a2100000-0000-0000-0000-000000000001', 'En reto propuesto', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-000000000004', 'a2100000-0000-0000-0000-000000000001', 'Reto terminado', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-000000000005', 'a2100000-0000-0000-0000-000000000001', 'Con check-in hoy', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-000000000006', 'a2100000-0000-0000-0000-000000000001', 'Con check-in ayer', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-000000000009', 'a2100000-0000-0000-0000-000000000001', 'Rival libre', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-000000000001', 'Servicio', 'book', 'daily', 'friends');
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, log_type, quantity_unit, quantity_target, quantity_step) values
  ('b2100000-0000-0000-0000-000000000007', 'a2100000-0000-0000-0000-000000000001', 'Agua hoy', 'drop', 'daily', 'friends', 'quantity', 'ml', 2000, 250),
  ('b2100000-0000-0000-0000-000000000008', 'a2100000-0000-0000-0000-000000000001', 'Agua en reto', 'drop', 'daily', 'friends', 'quantity', 'ml', 2000, 250),
  ('b2100000-0000-0000-0000-00000000000b', 'a2100000-0000-0000-0000-000000000001', 'Agua sin check-in', 'drop', 'daily', 'friends', 'quantity', 'ml', 2000, 250);
insert into public.habits (id, user_id, name, icon, frequency_type, visibility) values
  ('b2100000-0000-0000-0000-000000000012', 'a2100000-0000-0000-0000-000000000002', 'Rival 2', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-000000000013', 'a2100000-0000-0000-0000-000000000003', 'Rival 3', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-000000000014', 'a2100000-0000-0000-0000-000000000002', 'Rival 4', 'book', 'daily', 'friends'),
  ('b2100000-0000-0000-0000-000000000018', 'a2100000-0000-0000-0000-000000000004', 'Rival 8', 'drop', 'daily', 'friends');
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
                               requires_photo, weeks, fine_amount, timezone, status, starts_on) values
  ('c2100000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000002',
   'b2100000-0000-0000-0000-000000000002', 'b2100000-0000-0000-0000-000000000012', 'daily', null, false, 4, 1000, 'America/Santiago', 'active', tests.today()),
  ('c2100000-0000-0000-0000-000000000003', 'a2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000003',
   'b2100000-0000-0000-0000-000000000003', 'b2100000-0000-0000-0000-000000000013', 'daily', null, false, 4, 1000, 'America/Santiago', 'proposed', null),
  ('c2100000-0000-0000-0000-000000000004', 'a2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000002',
   'b2100000-0000-0000-0000-000000000004', 'b2100000-0000-0000-0000-000000000014', 'daily', null, false, 4, 1000, 'America/Santiago', 'finished', tests.today() - 40),
  ('c2100000-0000-0000-0000-000000000008', 'a2100000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000004',
   'b2100000-0000-0000-0000-000000000008', 'b2100000-0000-0000-0000-000000000018', 'daily', null, false, 4, 1000, 'America/Santiago', 'active', tests.today());
insert into public.checkins (habit_id, user_id, local_date) values
  ('b2100000-0000-0000-0000-000000000005', 'a2100000-0000-0000-0000-000000000001', tests.today()),
  ('b2100000-0000-0000-0000-000000000006', 'a2100000-0000-0000-0000-000000000001', tests.today() - 1),
  ('b2100000-0000-0000-0000-000000000007', 'a2100000-0000-0000-0000-000000000001', tests.today()),
  ('b2100000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-000000000001', tests.today());

select has_trigger('public', 'habits', 'habits_switch_guard', 'the switch guard is a trigger on habits');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2100000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- ---- a habit in a proposed or active challenge cannot switch TO quantity
select throws_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b2100000-0000-0000-0000-000000000002' $$, 'P0001', 'habit_in_challenge', 'active challenge: switching to quantity is refused');
select throws_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b2100000-0000-0000-0000-000000000003' $$, 'P0001', 'habit_in_challenge', 'proposed challenge: switching to quantity is refused');
select is((select log_type from public.habits where id = 'b2100000-0000-0000-0000-000000000002'), 'none', 'and the habit did not change');
select lives_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b2100000-0000-0000-0000-000000000004' $$, 'a finished challenge does not hold the habit');
select lives_ok($$ update public.habits set log_type = 'none', quantity_unit = null, quantity_target = null, quantity_step = null
  where id = 'b2100000-0000-0000-0000-000000000004' $$, 'and it can go back');
select lives_ok($$ update public.habits set log_type = 'time' where id = 'b2100000-0000-0000-0000-000000000002' $$,
  'a habit in a challenge can still switch between non-quantity types');
select lives_ok($$ update public.habits set log_type = 'none' where id = 'b2100000-0000-0000-0000-000000000002' $$, 'and back');

-- ---- no challenge and no check-in today: both ways work
select lives_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b2100000-0000-0000-0000-000000000001' $$, 'a free habit switches to quantity');
select lives_ok($$ update public.habits set quantity_unit = 'steps' where id = 'b2100000-0000-0000-0000-000000000001' $$,
  'and changes its unit');
select lives_ok($$ update public.habits set log_type = 'none', quantity_unit = null, quantity_target = null, quantity_step = null
  where id = 'b2100000-0000-0000-0000-000000000001' $$, 'and leaves quantity');
-- a check-in of another day does not count
select lives_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b2100000-0000-0000-0000-000000000006' $$, 'a check-in from yesterday does not block the switch');

-- ---- a check-in today blocks switching to or from quantity and changing the unit
select throws_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b2100000-0000-0000-0000-000000000005' $$, 'P0001', 'checkin_today', 'to quantity with a check-in today is refused');
select throws_ok($$ update public.habits set log_type = 'none', quantity_unit = null, quantity_target = null, quantity_step = null
  where id = 'b2100000-0000-0000-0000-000000000007' $$, 'P0001', 'checkin_today', 'from quantity with a check-in today is refused');
select throws_ok($$ update public.habits set quantity_unit = 'steps' where id = 'b2100000-0000-0000-0000-000000000007' $$,
  'P0001', 'checkin_today', 'a unit change with a check-in today is refused');
select throws_ok($$ update public.habits set log_type = 'time', quantity_unit = null, quantity_target = null, quantity_step = null
  where id = 'b2100000-0000-0000-0000-000000000007' $$, 'P0001', 'checkin_today', 'quantity to another detailed type too');
select is((select log_type from public.habits where id = 'b2100000-0000-0000-0000-000000000007'), 'quantity', 'the habit did not change');
select lives_ok($$ update public.habits set quantity_target = 3000, quantity_step = 500 where id = 'b2100000-0000-0000-0000-000000000007' $$,
  'goal and step edits with a check-in today are not affected by this guard');
select lives_ok($$ update public.habits set log_type = 'time' where id = 'b2100000-0000-0000-0000-000000000005' $$,
  'switching between non-quantity types with a check-in today is fine');
select lives_ok($$ update public.habits set name = 'Renombrado', archived_at = now() where id = 'b2100000-0000-0000-0000-000000000005' $$,
  'renaming and archiving a habit with a check-in today are unaffected');
select lives_ok($$ update public.habits set quantity_unit = 'steps' where id = 'b2100000-0000-0000-0000-00000000000b' $$,
  'a quantity habit without a check-in today changes its unit');

-- ---- the existing challenge rules of a quantity habit are untouched
select throws_ok($$ update public.habits set quantity_target = 1000 where id = 'b2100000-0000-0000-0000-000000000008' $$,
  'P0001', 'habit_in_challenge', 'a quantity habit in a challenge still cannot lower its goal');
select throws_ok($$ update public.habits set log_type = 'none', quantity_unit = null, quantity_target = null, quantity_step = null
  where id = 'b2100000-0000-0000-0000-000000000008' $$, 'P0001', 'habit_in_challenge', 'nor leave quantity');
select lives_ok($$ update public.habits set quantity_target = 2500 where id = 'b2100000-0000-0000-0000-000000000008' $$, 'but can raise it');

-- the app's full-row update: every column sent, log_type and quantity_unit unchanged, plus a rename
select lives_ok($$ update public.habits set name = name || ' 2', log_type = log_type, quantity_unit = quantity_unit,
  quantity_label = quantity_label, quantity_target = quantity_target, quantity_step = quantity_step
  where id = 'b2100000-0000-0000-0000-000000000008' $$, 'full-row update of a quantity habit in a challenge passes');
select lives_ok($$ update public.habits set name = name || ' 2', log_type = log_type, quantity_unit = quantity_unit,
  quantity_label = quantity_label, quantity_target = quantity_target, quantity_step = quantity_step
  where id = 'b2100000-0000-0000-0000-000000000007' $$, 'full-row update of a quantity habit with a check-in today passes');
select lives_ok($$ update public.habits set name = name || ' 2', log_type = log_type, quantity_unit = quantity_unit,
  quantity_label = quantity_label, quantity_target = quantity_target, quantity_step = quantity_step
  where id = 'b2100000-0000-0000-0000-000000000002' $$, 'full-row update of a plain habit in a challenge passes');

-- the rival_habit_id side: B owns the rival habit of the active challenge
select set_config('request.jwt.claims', '{"sub":"a2100000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b2100000-0000-0000-0000-000000000012' $$, 'P0001', 'habit_in_challenge', 'the rival''s habit cannot switch to quantity either');
reset role;

-- ---- the service role is not subject to the new checks
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b2100000-0000-0000-0000-00000000000a' $$, 'service_role switches a habit with a check-in today');
select lives_ok($$ update public.habits set log_type = 'quantity', quantity_unit = 'ml', quantity_target = 2000, quantity_step = 250
  where id = 'b2100000-0000-0000-0000-000000000003' $$, 'and a habit in a proposed challenge');
reset role;
-- the owner of the table (migrations, test setup) too
select lives_ok($$ update public.habits set log_type = 'none', quantity_unit = null, quantity_target = null, quantity_step = null
  where id = 'b2100000-0000-0000-0000-00000000000a' $$, 'the table owner leaves quantity with a check-in today');

-- the trigger is a client-role guard and a plain invoker function
select ok((select not prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.habits_switch_guard()'::regprocedure),
  'invoker function with search_path = ''''');
select ok(not has_function_privilege('authenticated', 'public.habits_switch_guard()', 'execute')
  and not has_function_privilege('anon', 'public.habits_switch_guard()', 'execute'), 'not executable by clients');

select * from finish();
rollback;
