begin;
-- supabase/seed.sql loads local test users; clear them so these fixtures are the only rows.
truncate public.profiles cascade;
delete from auth.users where email like '%@example.com';
create extension if not exists pgtap with schema extensions;
select plan(39);

-- ===== schema =====
select col_type_is('public', 'profiles', 'avatar_preset', 'smallint', 'profiles.avatar_preset is a smallint');
select col_not_null('public', 'profiles', 'avatar_preset', 'profiles.avatar_preset is not null');
select ok((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_preset') ~ 'random',
  'avatar_preset defaults to a random value');

-- ===== signup trigger (runs as postgres, like GoTrue) =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1700000-0000-0000-0000-000000000001', 'ava1@kizuna.app',
   '{"first_name":"Ana","last_name":"Uno","birth_date":"1990-01-01","username":"ava_one","timezone":"UTC","terms_accepted":true,"avatar_preset":3}'),
  ('a1700000-0000-0000-0000-000000000002', 'ava2@kizuna.app',
   '{"first_name":"Beto","last_name":"Dos","birth_date":"1990-01-01","username":"ava_two","timezone":"UTC","terms_accepted":true}'),
  ('a1700000-0000-0000-0000-000000000003', 'ava3@kizuna.app',
   '{"first_name":"Cami","last_name":"Tres","birth_date":"1990-01-01","username":"ava_three","timezone":"UTC","terms_accepted":true,"avatar_preset":9}'),
  ('a1700000-0000-0000-0000-000000000004', 'ava4@kizuna.app',
   '{"first_name":"Dani","last_name":"Cuatro","birth_date":"1990-01-01","username":"ava_four","timezone":"UTC","terms_accepted":true,"avatar_preset":"3"}'),
  ('a1700000-0000-0000-0000-000000000005', 'ava5@kizuna.app',
   '{"first_name":"Eli","last_name":"Cinco","birth_date":"1990-01-01","username":"ava_five","timezone":"UTC","terms_accepted":true,"avatar_preset":0}'),
  ('a1700000-0000-0000-0000-000000000006', 'ava6@kizuna.app',
   '{"first_name":"Fer","last_name":"Seis","birth_date":"1990-01-01","username":"ava_six","timezone":"UTC","terms_accepted":true,"avatar_preset":2.5}'),
  ('a1700000-0000-0000-0000-000000000007', 'ava7@kizuna.app',
   '{"first_name":"Gus","last_name":"Siete","birth_date":"1990-01-01","username":"ava_seven","timezone":"UTC","terms_accepted":true,"avatar_preset":8}'),
  ('a1700000-0000-0000-0000-000000000008', 'ava8@kizuna.app',
   '{"first_name":"Hugo","last_name":"Ocho","birth_date":"1990-01-01","username":"ava_eight","timezone":"UTC","terms_accepted":true,"avatar_preset":null}');

select is((select avatar_preset from public.profiles where id = 'a1700000-0000-0000-0000-000000000001'), 3::smallint,
  'the trigger honors a valid avatar_preset from the signup metadata');
select is((select avatar_preset from public.profiles where id = 'a1700000-0000-0000-0000-000000000007'), 8::smallint,
  'the upper bound 8 is honored');
select ok((select avatar_preset from public.profiles where id = 'a1700000-0000-0000-0000-000000000002') between 1 and 8,
  'a signup without avatar_preset gets a random preset within 1..8');
select ok((select avatar_preset from public.profiles where id = 'a1700000-0000-0000-0000-000000000003') between 1 and 8,
  'an out-of-range metadata value (9) is ignored and the random default applies');
select ok((select avatar_preset from public.profiles where id = 'a1700000-0000-0000-0000-000000000004') between 1 and 8,
  'a non-integer metadata value (string) falls back to a random preset');
select ok((select avatar_preset from public.profiles where id = 'a1700000-0000-0000-0000-000000000005') between 1 and 8,
  'zero is ignored and a random preset applies');
select ok((select avatar_preset from public.profiles where id = 'a1700000-0000-0000-0000-000000000006') between 1 and 8,
  'a fractional value is ignored and a random preset applies');
select ok((select avatar_preset from public.profiles where id = 'a1700000-0000-0000-0000-000000000008') between 1 and 8,
  'a null metadata value falls back to a random preset');
select is((select count(*)::int from public.profiles where avatar_preset is null or avatar_preset not between 1 and 8), 0,
  'every profile holds a preset within 1..8');
select throws_ok(
  $$ update public.profiles set avatar_preset = 9 where id = 'a1700000-0000-0000-0000-000000000001' $$,
  '23514', null, 'the check constraint refuses 9');
select throws_ok(
  $$ update public.profiles set avatar_preset = 0 where id = 'a1700000-0000-0000-0000-000000000001' $$,
  '23514', null, 'the check constraint refuses 0');

-- ===== fixtures for the rest: friend, public habit, invite, deleted account =====
insert into public.friendships (requester_id, addressee_id, status) values
  ('a1700000-0000-0000-0000-000000000001', 'a1700000-0000-0000-0000-000000000002', 'accepted');
insert into public.habits (id, user_id, name, icon, frequency_type, visibility) values
  ('b1700000-0000-0000-0000-000000000001', 'a1700000-0000-0000-0000-000000000001', 'Leer', 'book', 'daily', 'public');
insert into public.invites (inviter_id, code, expires_at) values
  ('a1700000-0000-0000-0000-000000000001', 'ava_code', now() + interval '1 day'),
  ('a1700000-0000-0000-0000-000000000008', 'ava_gone', now() + interval '1 day');
update public.profiles set deleted_at = now() where id = 'a1700000-0000-0000-0000-000000000008';

-- ===== public_profiles view =====
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'public_profiles'), 5,
  'public_profiles exposes exactly 5 columns');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
            where table_schema = 'public' and table_name = 'public_profiles'),
  array['id', 'username', 'display_name', 'avatar_path', 'avatar_preset'],
  'public_profiles columns are id, username, display_name, avatar_path, avatar_preset');
select is((select count(*)::int from public.public_profiles where id = 'a1700000-0000-0000-0000-000000000008'), 0,
  'public_profiles still hides deleted accounts');
select ok(not has_table_privilege('anon', 'public.public_profiles', 'SELECT'), 'anon cannot read public_profiles');
select ok(has_table_privilege('authenticated', 'public.public_profiles', 'SELECT'), 'authenticated can read public_profiles');

-- ===== A: owner (a friend of B) =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok($$ select public.set_avatar_preset(5) $$, 'a user can set their own preset');
select is((select avatar_preset from public.public_profiles where id = 'a1700000-0000-0000-0000-000000000001'), 5::smallint,
  'the new preset is stored on the own row');
select throws_ok($$ select public.set_avatar_preset(9) $$, 'P0001', 'invalid_avatar_preset', 'out-of-range presets are rejected (9)');
select throws_ok($$ select public.set_avatar_preset(0) $$, 'P0001', 'invalid_avatar_preset', 'out-of-range presets are rejected (0)');
select throws_ok($$ select public.set_avatar_preset(null) $$, 'P0001', 'invalid_avatar_preset', 'null presets are rejected');
select throws_ok($$ update public.profiles set avatar_preset = 2 where id = 'a1700000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a direct UPDATE of the column is denied');
select is((select avatar_preset from public.public_profiles where id = 'a1700000-0000-0000-0000-000000000001'), 5::smallint,
  'the failed direct UPDATE changed nothing');
select is(public.invite_preview('ava_code')->>'avatarPreset', '5', 'invite_preview returns the inviter preset');
select is(public.public_profile('ava_one')->>'avatarPreset', '5', 'public_profile() carries avatarPreset');

-- ===== set_avatar_preset only changes the caller row =====
select is((select avatar_preset from public.public_profiles where id = 'a1700000-0000-0000-0000-000000000007'), 8::smallint,
  'a stranger row (7) keeps its preset after A changed their own');

select is((select array_agg(k order by k) from jsonb_object_keys(public.public_profile('ava_one')) k),
  array['avatarPath', 'avatarPreset', 'avatarUpdatedAt', 'displayName', 'habits', 'username'],
  'public_profile() returns exactly the whitelisted keys (no height or birth data)');
select is((select array_agg(k order by k) from jsonb_object_keys(public.invite_preview('ava_code')) k),
  array['avatarPath', 'avatarPreset', 'displayName', 'username'],
  'invite_preview() returns exactly the whitelisted keys');
select is(public.invite_preview('ava_gone'), null, 'invite_preview is null when the inviter was deleted');
create temp table b_before as select avatar_preset from public.public_profiles where id = 'a1700000-0000-0000-0000-000000000002';
select lives_ok($$ select public.set_avatar_preset(1) $$, 'A sets another preset');
select is((select avatar_preset from public.public_profiles where id = 'a1700000-0000-0000-0000-000000000002'),
  (select avatar_preset from b_before), 'set_avatar_preset never touches another user row (B)');

-- ===== B: a friend reads A's preset through public_profiles =====
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select avatar_preset from public.public_profiles where id = 'a1700000-0000-0000-0000-000000000001'), 1::smallint,
  'a friend reads the preset through public_profiles');

-- ===== deleted account =====
select set_config('request.jwt.claims', '{"sub":"a1700000-0000-0000-0000-000000000008","role":"authenticated"}', true);
select throws_ok($$ select public.set_avatar_preset(2) $$, 'P0001', 'not_authenticated', 'a deleted account cannot set a preset');

-- ===== anonymous =====
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.set_avatar_preset(2) $$, '42501', null, 'anon cannot execute set_avatar_preset');
select is(public.public_profile('ava_one')->>'avatarPreset', '1', 'anon reads the preset only through public_profile()');
select is(public.public_profile('ava_eight'), null, 'a deleted account has no public profile, so no preset');

select * from finish();
rollback;
