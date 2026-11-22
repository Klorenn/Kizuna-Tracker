begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- A and B are strangers; A owns two habits, B one (public, for the profile RPC)
insert into auth.users (id) values
  ('a1600000-0000-0000-0000-000000000001'),
  ('a1600000-0000-0000-0000-000000000002');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a1600000-0000-0000-0000-000000000001', 'color_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a1600000-0000-0000-0000-000000000002', 'color_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago');
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, preset) values
  ('b1600000-0000-0000-0000-000000000001', 'a1600000-0000-0000-0000-000000000001', 'Gimnasio', 'barbell', 'daily', 'friends', 'gym'),
  ('b1600000-0000-0000-0000-000000000002', 'a1600000-0000-0000-0000-000000000001', 'Yoga', 'target', 'daily', 'friends', null);
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, preset, color) values
  ('b1600000-0000-0000-0000-000000000003', 'a1600000-0000-0000-0000-000000000002', 'Leer', 'book', 'daily', 'public', 'read', 'arena');

-- ===== schema =====
select col_not_null('public', 'habits', 'color', 'habits.color is not null');
select col_default_is('public', 'habits', 'color', 'indigo', 'habits.color defaults to indigo');
select is((select color from public.habits where id = 'b1600000-0000-0000-0000-000000000002'), 'indigo',
  'a habit inserted without a color gets indigo');
select is((select color from public.habits where id = 'b1600000-0000-0000-0000-000000000001'), 'indigo',
  'the default never guesses from the preset (the app sends the preset color explicitly)');
select throws_ok(
  $$ update public.habits set color = 'neon' where id = 'b1600000-0000-0000-0000-000000000002' $$,
  '23514', null, 'the check constraint refuses keys outside the palette');
select throws_ok(
  $$ update public.habits set color = '#5a5ac2' where id = 'b1600000-0000-0000-0000-000000000002' $$,
  '23514', null, 'hex values are refused: the db stores token names');

-- ===== backfill mapping (the same function filled existing rows) =====
select is(
  (select array_agg(public.habit_preset_color(p) order by p)
     from unnest(array['eat_well', 'gym', 'read', 'sleep', 'study', 'walk', 'water']) p),
  array['oliva', 'durazno', 'arena', 'indigo', 'lavanda', 'salvia', 'cielo'],
  'presets map to their default colors');
select is(public.habit_preset_color(null), 'indigo', 'a custom habit maps to indigo');
select is(public.habit_preset_color('unknown'), 'indigo', 'an unknown preset maps to indigo');

create schema tests;
create function tests.n(q text) returns int language plpgsql as $f$
declare c int;
begin
  execute 'with u as (' || q || ') select count(*)::int from u' into c;
  return c;
end $f$;
grant usage on schema tests to authenticated;
grant execute on function tests.n(text) to authenticated;

-- ===== A: owner =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1600000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(tests.n($$ update public.habits set color = 'rosa' where id = 'b1600000-0000-0000-0000-000000000001' returning 1 $$), 1,
  'the owner can change the color of their habit');
select is((select color from public.habits where id = 'b1600000-0000-0000-0000-000000000001'), 'rosa', 'the new color is stored');
select lives_ok(
  $$ insert into public.habits (user_id, name, icon, frequency_type, color)
     values ('a1600000-0000-0000-0000-000000000001', 'Agua', 'drop', 'daily', 'cielo') $$,
  'the owner can create a habit with a color');
select is((select color from public.habits where name = 'Agua' and user_id = 'a1600000-0000-0000-0000-000000000001'), 'cielo',
  'the chosen color is stored on insert');
select throws_ok(
  $$ update public.habits set color = 'neon' where id = 'b1600000-0000-0000-0000-000000000001' $$,
  '23514', null, 'clients cannot store a color outside the palette');
select is(tests.n($$ update public.habits set color = 'oliva' where id = 'b1600000-0000-0000-0000-000000000003' returning 1 $$), 0,
  'a user cannot change the color of someone elses habit');

reset role;
select is((select color from public.habits where id = 'b1600000-0000-0000-0000-000000000003'), 'arena',
  'the other habit keeps its color');

-- ===== anonymous =====
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ update public.habits set color = 'rosa' where id = 'b1600000-0000-0000-0000-000000000003' $$,
  '42501', null, 'anonymous users cannot update habits');
select is((public.public_profile('color_b') -> 'habits' -> 0 ->> 'color'), 'arena',
  'the public profile exposes the color of public habits');
select is((public.public_profile('color_b') -> 'habits' -> 0 ->> 'name'), 'Leer', 'the public profile still lists the habit');
select ok(not ((public.public_profile('color_b') -> 'habits' -> 0) ? 'id'), 'the public profile does not expose habit ids');
select ok(public.public_profile('color_b') ? 'avatarUpdatedAt', 'the public profile carries the avatar version for its cache-buster');

select * from finish();
rollback;
