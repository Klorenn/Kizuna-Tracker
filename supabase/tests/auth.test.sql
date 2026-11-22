begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- ===== handle_new_user trigger (runs as postgres, like GoTrue) =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'pau@kizuna.app',
   '{"first_name":"Pau","last_name":"Koh","birth_date":"1998-04-12","username":"pau_k","timezone":"America/Santiago","terms_accepted":true}');

select is((select display_name from public.profiles where id = 'a1000000-0000-0000-0000-000000000001'),
  'Pau Koh', 'valid metadata creates the profile with generated display_name');
select isnt((select terms_accepted_at from public.profiles where id = 'a1000000-0000-0000-0000-000000000001'),
  null, 'terms_accepted_at is stamped');
select is((select timezone from public.profiles where id = 'a1000000-0000-0000-0000-000000000001'),
  'America/Santiago', 'timezone is stored');

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('a1000000-0000-0000-0000-000000000002', 'minor@kizuna.app',
     jsonb_build_object('first_name','M','last_name','N','birth_date',((now() - interval '17 years')::date)::text,'username','minor_1','timezone','UTC','terms_accepted',true)) $$,
  'P0001', 'underage', 'underage signup is rejected');

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('a1000000-0000-0000-0000-000000000003', 'ok1@kizuna.app',
     '{"first_name":"M","last_name":"N","birth_date":"1990-01-01","username":"adult_1","timezone":"UTC","terms_accepted":false}') $$,
  'P0001', 'terms_required', 'terms_accepted false is rejected');

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('a1000000-0000-0000-0000-000000000004', 'ok2@kizuna.app',
     '{"first_name":"M","last_name":"N","birth_date":"1990-01-01","username":"adult_2","timezone":"UTC"}') $$,
  'P0001', 'terms_required', 'missing terms_accepted is rejected');

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('a1000000-0000-0000-0000-000000000005', 'ok3@kizuna.app',
     '{"first_name":"M","last_name":"N","birth_date":"1990-01-01","username":"adult_3","timezone":"Mars/Base","terms_accepted":true}') $$,
  'P0001', 'invalid_timezone', 'unknown timezone is rejected');

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('a1000000-0000-0000-0000-000000000011', 'old1@kizuna.app',
     '{"first_name":"M","last_name":"N","birth_date":"1899-12-31","username":"adult_4","timezone":"UTC","terms_accepted":true}') $$,
  'P0001', 'invalid_birth_date', 'birth dates before 1900 are rejected');

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('a1000000-0000-0000-0000-000000000012', 'old2@kizuna.app',
     '{"first_name":"M","last_name":"N","birth_date":"infinity","username":"adult_5","timezone":"UTC","terms_accepted":true}') $$,
  'P0001', 'invalid_birth_date', 'infinity birth date is rejected');

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('a1000000-0000-0000-0000-000000000013', 'old3@kizuna.app',
     '{"first_name":"M","last_name":"N","birth_date":"not-a-date","username":"adult_6","timezone":"UTC","terms_accepted":true}') $$,
  'P0001', 'invalid_birth_date', 'unparseable birth date is rejected');

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('a1000000-0000-0000-0000-000000000006', 'dup@kizuna.app',
     '{"first_name":"M","last_name":"N","birth_date":"1990-01-01","username":"PAU_K","timezone":"UTC","terms_accepted":true}') $$,
  '23514', null, 'invalid username format is rejected by the existing constraint');

select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data) values ('a1000000-0000-0000-0000-000000000007', 'dup2@kizuna.app',
     '{"first_name":"M","last_name":"N","birth_date":"1990-01-01","username":"pau_k","timezone":"UTC","terms_accepted":true}') $$,
  '23505', null, 'duplicate username is rejected by the unique constraint');

insert into auth.users (id, email) values ('a1000000-0000-0000-0000-000000000008', 'plain@kizuna.app');
select is((select count(*)::int from public.profiles where id = 'a1000000-0000-0000-0000-000000000008'),
  0, 'auth user without username metadata gets no profile');

-- fixtures for lookups (direct insert as postgres)
insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000009', 'user_a@kizuna.app'),
  ('a1000000-0000-0000-0000-000000000010', 'gone@kizuna.app');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at) values
  ('a1000000-0000-0000-0000-000000000009', 'user_a', 'A', 'Test', '1990-01-01', now(), 'UTC', null),
  ('a1000000-0000-0000-0000-000000000010', 'gone_1', 'G', 'Test', null, now(), 'UTC', now());

-- ===== authenticated cannot create profiles =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000008","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
     values ('a1000000-0000-0000-0000-000000000008', 'sneaky', 'S', 'T', '1990-01-01', now(), 'UTC') $$,
  '42501', null, 'authenticated cannot insert into profiles');
select throws_ok($$ select * from public.login_attempts $$, '42501', null, 'authenticated cannot read login_attempts');
select throws_ok($$ select public.register_login_attempt(array['id:x']) $$, '42501', null, 'authenticated cannot register login attempts');
reset role;

-- ===== anon =====
set local role anon;
select is(public.username_available('user_a'), false, 'taken username is unavailable');
select is(public.username_available('gone_1'), false, 'deleted username is unavailable');
select is(public.username_available('libre_1'), true, 'free username is available');
select is(public.username_available('AB'), false, 'invalid username format is unavailable');
select throws_ok($$ select public.email_for_username('user_a') $$, '42501', null, 'anon cannot resolve usernames to emails');
select is(public.username_available(null), false, 'null username is unavailable, not null');
select throws_ok($$ select * from public.account_for_login('username', 'user_a') $$, '42501', null, 'anon cannot resolve accounts');
reset role;

-- ===== service_role =====
set local role service_role;
select is(public.email_for_username('user_a'), 'user_a@kizuna.app', 'service role resolves username to email');
select is(public.email_for_username('gone_1'), null, 'deleted user resolves to null');
select is(public.email_for_username('nadie_1'), null, 'unknown user resolves to null');
select is((select user_id from public.account_for_login('username', 'USER_A')), 'a1000000-0000-0000-0000-000000000009'::uuid, 'handle resolves to the user id');
select is((select user_id from public.account_for_login('email', 'User_A@Kizuna.app')), 'a1000000-0000-0000-0000-000000000009'::uuid, 'email resolves to the same user id');
select is((select count(*)::int from public.account_for_login('username', 'gone_1')), 0, 'deleted handle does not resolve');
select is((select count(*)::int from public.account_for_login('email', 'nadie@kizuna.app')), 0, 'unknown email does not resolve');
select is((select count(*) filter (where r)::int from (select public.register_login_attempt(array['chk:203.0.113.9']) as r from generate_series(1, 60)) s),
  60, 'a chk key allows 60 attempts');
select is(public.register_login_attempt(array['chk:203.0.113.9']), false, 'the 61st chk attempt is blocked');

select is((select count(*) filter (where r)::int from (select public.register_login_attempt(array['id:pau']) as r from generate_series(1, 10)) s),
  10, 'first 10 attempts for an id key are allowed');
select is(public.register_login_attempt(array['id:pau']), false, 'the 11th attempt for an id key is blocked');
select is(public.register_login_attempt(array['id:otra']), true, 'other keys are unaffected');
select is((select count(*) filter (where r)::int from (select public.register_login_attempt(array['ip:203.0.113.7']) as r from generate_series(1, 30)) s),
  30, 'an ip key allows 30 attempts');
select is(public.register_login_attempt(array['ip:203.0.113.7']), false, 'the 31st attempt for an ip key is blocked');
reset role;

-- window and cleanup
insert into public.login_attempts (key, created_at)
  select 'id:aged', now() - interval '1 hour' from generate_series(1, 12);
insert into public.login_attempts (key, created_at) values ('id:old', now() - interval '2 days');
set local role service_role;
select is(public.register_login_attempt(array['id:aged']), true, 'attempts older than 15 minutes do not count');
select public.register_login_attempt(array['id:fresh']);
reset role;
select is((select count(*)::int from public.login_attempts where key = 'id:old'), 0, 'attempts older than a day are purged');

select * from finish();
rollback;
