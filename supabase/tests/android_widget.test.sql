begin;
-- Android widget: device tokens, one-time pairing codes and the service-role check-in.
-- Every widget_* call below runs AS service_role (the role the /api/widget routes use) so a missing
-- grant fails here and not silently in production with 42501.
create extension if not exists pgtap with schema extensions;
select plan(139);

create schema tests;
create function tests.h(t text) returns text language sql immutable as $f$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(t, 'UTF8')), 'hex')
$f$;
grant usage on schema tests to authenticated, anon, service_role;
grant execute on function tests.h(text) to authenticated, anon, service_role;

-- Fixtures: 1 and 2 live users, 3 deleted, 4 is deleted at the end (cascade).
insert into auth.users (id) values
  ('a2700000-0000-0000-0000-000000000001'),
  ('a2700000-0000-0000-0000-000000000002'),
  ('a2700000-0000-0000-0000-000000000003'),
  ('a2700000-0000-0000-0000-000000000004');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at) values
  ('a2700000-0000-0000-0000-000000000001', 'wd_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a2700000-0000-0000-0000-000000000002', 'wd_b', 'B', 'Test', '1990-01-01', now(), 'Europe/Madrid', null),
  ('a2700000-0000-0000-0000-000000000003', 'wd_gone', 'G', 'Test', '1990-01-01', now(), 'America/Santiago', now()),
  ('a2700000-0000-0000-0000-000000000004', 'wd_cascade', 'C', 'Test', '1990-01-01', now(), 'America/Santiago', null);

-- habits of A: boolean, quantity, items, photo, archived, reading, second boolean, archived reading, workout.
insert into public.habits (id, user_id, name, icon, frequency_type, visibility, log_type, quantity_unit, quantity_target, quantity_step, requires_photo, archived_at) values
  ('b2700000-0000-0000-0000-000000000001', 'a2700000-0000-0000-0000-000000000001', 'Boolean', 'book', 'daily', 'friends', 'none', null, null, null, false, null),
  ('b2700000-0000-0000-0000-000000000002', 'a2700000-0000-0000-0000-000000000001', 'Agua', 'drop', 'daily', 'friends', 'quantity', 'ml', 2000, 250, false, null),
  ('b2700000-0000-0000-0000-000000000003', 'a2700000-0000-0000-0000-000000000001', 'Con pasos', 'book', 'daily', 'friends', 'none', null, null, null, false, null),
  ('b2700000-0000-0000-0000-000000000004', 'a2700000-0000-0000-0000-000000000001', 'Con foto', 'book', 'daily', 'friends', 'none', null, null, null, true, null),
  ('b2700000-0000-0000-0000-000000000005', 'a2700000-0000-0000-0000-000000000001', 'Archivado', 'book', 'daily', 'friends', 'none', null, null, null, false, now()),
  ('b2700000-0000-0000-0000-000000000006', 'a2700000-0000-0000-0000-000000000001', 'Leer', 'book', 'daily', 'friends', 'reading', null, null, null, false, null),
  ('b2700000-0000-0000-0000-000000000007', 'a2700000-0000-0000-0000-000000000001', 'Boolean 2', 'book', 'daily', 'friends', 'none', null, null, null, false, null),
  ('b2700000-0000-0000-0000-000000000008', 'a2700000-0000-0000-0000-000000000001', 'Leer archivado', 'book', 'daily', 'friends', 'reading', null, null, null, false, now()),
  ('b2700000-0000-0000-0000-000000000009', 'a2700000-0000-0000-0000-000000000001', 'Gym', 'barbell', 'daily', 'friends', 'workout', null, null, null, false, null),
  ('b2700000-0000-0000-0000-00000000000a', 'a2700000-0000-0000-0000-000000000002', 'Boolean B', 'book', 'daily', 'friends', 'none', null, null, null, false, null),
  ('b2700000-0000-0000-0000-00000000000b', 'a2700000-0000-0000-0000-000000000003', 'Boolean G', 'book', 'daily', 'friends', 'none', null, null, null, false, null);
insert into public.habit_items (habit_id, user_id, label, position) values
  ('b2700000-0000-0000-0000-000000000003', 'a2700000-0000-0000-0000-000000000001', 'Paso uno', 0);

-- ============================================================ structure and grants
select has_table('public', 'widget_tokens', 'widget_tokens exists');
select has_table('public', 'widget_pairing_codes', 'widget_pairing_codes exists');
select ok((select relrowsecurity from pg_class where oid = 'public.widget_tokens'::regclass), 'RLS on widget_tokens');
select ok((select relrowsecurity from pg_class where oid = 'public.widget_pairing_codes'::regclass), 'RLS on widget_pairing_codes');
select ok(not has_column_privilege('authenticated', 'public.widget_tokens', 'token_hash', 'SELECT'), 'authenticated cannot select token_hash');
select ok(not has_column_privilege('anon', 'public.widget_tokens', 'token_hash', 'SELECT'), 'anon cannot select token_hash');
select ok(has_column_privilege('authenticated', 'public.widget_tokens', 'label', 'SELECT'), 'authenticated can select the label');
select ok(not has_table_privilege('authenticated', 'public.widget_tokens', 'INSERT'), 'authenticated cannot insert tokens');
select ok(not has_table_privilege('authenticated', 'public.widget_tokens', 'UPDATE'), 'authenticated cannot update tokens');
select ok(not has_table_privilege('authenticated', 'public.widget_tokens', 'DELETE'), 'authenticated cannot delete tokens');
select ok(not has_table_privilege('authenticated', 'public.widget_pairing_codes', 'SELECT'), 'pairing codes are unreadable to authenticated');
select ok(not has_table_privilege('anon', 'public.widget_pairing_codes', 'SELECT'), 'and to anon');
select ok(not has_table_privilege('authenticated', 'public.widget_pairing_codes', 'INSERT'), 'and not insertable');

select ok(not has_function_privilege('authenticated', 'public.widget_create_checkin(uuid,uuid)', 'execute'), 'authenticated cannot run widget_create_checkin');
select ok(not has_function_privilege('anon', 'public.widget_create_checkin(uuid,uuid)', 'execute'), 'anon cannot run widget_create_checkin');
select ok(has_function_privilege('service_role', 'public.widget_create_checkin(uuid,uuid)', 'execute'), 'service_role can run widget_create_checkin');
select ok(not has_function_privilege('authenticated', 'public.widget_pair(text,text,text,text,text)', 'execute'), 'authenticated cannot run widget_pair');
select ok(not has_function_privilege('anon', 'public.widget_pair(text,text,text,text,text)', 'execute'), 'anon cannot run widget_pair');
select ok(has_function_privilege('service_role', 'public.widget_pair(text,text,text,text,text)', 'execute'), 'service_role can run widget_pair');
select ok(not has_function_privilege('authenticated', 'public.widget_auth(text,text,text)', 'execute'), 'authenticated cannot run widget_auth');
select ok(not has_function_privilege('anon', 'public.widget_auth(text,text,text)', 'execute'), 'anon cannot run widget_auth');
select ok(has_function_privilege('service_role', 'public.widget_auth(text,text,text)', 'execute'), 'service_role can run widget_auth');
select ok(not has_function_privilege('authenticated', 'public.create_checkin_as(uuid,uuid)', 'execute'), 'authenticated cannot run create_checkin_as');
select ok(not has_function_privilege('anon', 'public.create_checkin_as(uuid,uuid)', 'execute'), 'anon cannot run create_checkin_as');
select ok(not has_function_privilege('service_role', 'public.create_checkin_as(uuid,uuid)', 'execute'), 'service_role cannot run create_checkin_as directly');
select ok(has_function_privilege('authenticated', 'public.create_checkin(uuid)', 'execute'), 'authenticated still runs create_checkin');
select ok(not has_function_privilege('anon', 'public.create_checkin(uuid)', 'execute'), 'anon still cannot');
select ok(has_function_privilege('authenticated', 'public.create_widget_pairing_code()', 'execute'), 'authenticated runs create_widget_pairing_code');
select ok(not has_function_privilege('anon', 'public.create_widget_pairing_code()', 'execute'), 'anon cannot run create_widget_pairing_code');
select ok(has_function_privilege('authenticated', 'public.revoke_widget_token(uuid)', 'execute'), 'authenticated runs revoke_widget_token');
select ok(not has_function_privilege('anon', 'public.revoke_widget_token(uuid)', 'execute'), 'anon cannot run revoke_widget_token');
select is((select pronargs::int from pg_proc where proname = 'create_checkin' and pronamespace = 'public'::regnamespace), 1, 'create_checkin keeps its one-argument signature');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('create_checkin_as', 'create_checkin', 'widget_create_checkin', 'create_widget_pairing_code', 'widget_pair', 'widget_auth', 'revoke_widget_token')
  and p.prosecdef and p.proconfig @> array['search_path=""']), 7, 'all seven functions are SECURITY DEFINER with an empty search_path');

-- ============================================================ check-in parity: web entry point (authenticated)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select created from public.create_checkin('b2700000-0000-0000-0000-000000000001')), true, 'web: boolean habit is checked in');
select set_config('tests.web_cid', (select checkin_id::text from public.create_checkin('b2700000-0000-0000-0000-000000000001')), true);
select is((select created from public.create_checkin('b2700000-0000-0000-0000-000000000001')), false, 'web: a repeat is idempotent');
select throws_ok($$ select public.create_checkin('b2700000-0000-0000-0000-000000000002') $$, 'P0001', 'quantity_habit', 'web: quantity habit');
select throws_ok($$ select public.create_checkin('b2700000-0000-0000-0000-000000000003') $$, 'P0001', 'habit_has_items', 'web: habit with items');
select throws_ok($$ select public.create_checkin('b2700000-0000-0000-0000-000000000004') $$, 'P0001', 'photo_required', 'web: photo habit');
select throws_ok($$ select public.create_checkin('b2700000-0000-0000-0000-000000000005') $$, 'P0001', 'habit_not_found', 'web: archived habit');
select throws_ok($$ select public.create_checkin('b2700000-0000-0000-0000-00000000000a') $$, 'P0001', 'habit_not_found', 'web: foreign habit');
select throws_ok($$ select public.create_checkin('b2700000-0000-0000-0000-000000000099') $$, 'P0001', 'habit_not_found', 'web: unknown habit');
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.create_checkin('b2700000-0000-0000-0000-00000000000b') $$, '28000', 'not_authenticated', 'web: deleted profile');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select public.create_checkin('b2700000-0000-0000-0000-000000000001') $$, '28000', 'not_authenticated', 'web: no user');
-- the internal body and the widget function are closed to a signed-in user
select throws_ok($$ select public.create_checkin_as('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000007') $$, '42501', null, 'authenticated cannot call create_checkin_as');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000007') $$, '42501', null, 'authenticated cannot call widget_create_checkin');
reset role;

-- ============================================================ check-in parity: widget entry point (service_role)
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select checkin_id::text from public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000001')),
  current_setting('tests.web_cid'), 'widget: the repeat returns the very row the web created');
select is((select created from public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000001')), false, 'widget: repeat is idempotent');
select is((select created from public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000007')), true, 'widget: boolean habit is checked in');
select is((select created from public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000007')), false, 'widget: second tap creates nothing');
select is((select created from public.widget_create_checkin('a2700000-0000-0000-0000-000000000002', 'b2700000-0000-0000-0000-00000000000a')), true, 'widget: another user checks their own habit');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000002') $$, 'P0001', 'quantity_habit', 'widget: quantity habit');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000003') $$, 'P0001', 'habit_has_items', 'widget: habit with items');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000004') $$, 'P0001', 'photo_required', 'widget: photo habit');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000005') $$, 'P0001', 'habit_not_found', 'widget: archived habit');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-00000000000a') $$, 'P0001', 'habit_not_found', 'widget: foreign habit is never toggled');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000099') $$, 'P0001', 'habit_not_found', 'widget: unknown habit');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000003', 'b2700000-0000-0000-0000-00000000000b') $$, '28000', 'not_authenticated', 'widget: deleted profile');
select throws_ok($$ select public.widget_create_checkin(null, 'b2700000-0000-0000-0000-000000000001') $$, '28000', 'not_authenticated', 'widget: null user');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000006') $$, 'P0001', 'widget_unsupported', 'widget: reading habit is unsupported');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000009') $$, 'P0001', 'widget_unsupported', 'widget: workout habit is unsupported');
select throws_ok($$ select public.widget_create_checkin('a2700000-0000-0000-0000-000000000001', 'b2700000-0000-0000-0000-000000000008') $$, 'P0001', 'habit_not_found', 'widget: an archived reading habit is simply not found');
reset role;
select is((select count(*)::int from public.checkins where habit_id = 'b2700000-0000-0000-0000-000000000001'), 1, 'one effective check-in row for the boolean habit across both entry points');
select is((select user_id from public.checkins where habit_id = 'b2700000-0000-0000-0000-000000000007'), 'a2700000-0000-0000-0000-000000000001'::uuid, 'the widget check-in belongs to the user it was made for');
select is((select count(*)::int from public.checkins where habit_id in ('b2700000-0000-0000-0000-000000000002', 'b2700000-0000-0000-0000-000000000003',
  'b2700000-0000-0000-0000-000000000004', 'b2700000-0000-0000-0000-000000000005', 'b2700000-0000-0000-0000-000000000006', 'b2700000-0000-0000-0000-000000000009')), 0,
  'every refused habit left no check-in behind');

-- ============================================================ pairing codes (web)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('tests.code1', (select code from public.create_widget_pairing_code()), true);
select matches(current_setting('tests.code1'), '^[2-9A-HJ-NP-Z]{8}$', 'the code is 8 characters of the unambiguous alphabet');
select set_config('tests.code0', current_setting('tests.code1'), true);
select set_config('tests.code1', (select code from public.create_widget_pairing_code()), true);
select throws_ok($$ select * from public.widget_pairing_codes $$, '42501', null, 'authenticated cannot read pairing codes');
select throws_ok($$ select token_hash from public.widget_tokens $$, '42501', null, 'authenticated cannot read token_hash');
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select * from public.create_widget_pairing_code() $$, '28000', 'not_authenticated', 'a deleted profile cannot ask for a code');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select * from public.create_widget_pairing_code() $$, '28000', 'not_authenticated', 'nor a request without a user');
reset role;
select is((select expires_at from public.widget_pairing_codes where code_hash = tests.h(current_setting('tests.code1'))), now() + interval '5 minutes', 'the code lives 5 minutes');
select is((select count(*)::int from public.widget_pairing_codes where user_id = 'a2700000-0000-0000-0000-000000000001' and used_at is null), 1, 'only one live code per user');
select is((select code_hash from public.widget_pairing_codes where user_id = 'a2700000-0000-0000-0000-000000000001' and used_at is null),
  tests.h(current_setting('tests.code1')), 'only the sha256 of the code is stored');

-- ============================================================ widget_pair (service_role)
insert into public.widget_pairing_codes (code_hash, user_id, expires_at) values
  (tests.h('EXPD2345'), 'a2700000-0000-0000-0000-000000000001', now() - interval '1 minute'),
  (tests.h('NRMM2345'), 'a2700000-0000-0000-0000-000000000001', now() + interval '5 minutes'),
  (tests.h('BLNK2345'), 'a2700000-0000-0000-0000-000000000001', now() + interval '5 minutes'),
  (tests.h('LNNG2345'), 'a2700000-0000-0000-0000-000000000001', now() + interval '5 minutes'),
  (tests.h('CAPP2345'), 'a2700000-0000-0000-0000-000000000001', now() + interval '5 minutes'),
  (tests.h('REVK2345'), 'a2700000-0000-0000-0000-000000000001', now() + interval '5 minutes'),
  (tests.h('USR22345'), 'a2700000-0000-0000-0000-000000000002', now() + interval '5 minutes'),
  (tests.h('GNNE2345'), 'a2700000-0000-0000-0000-000000000003', now() + interval '5 minutes'),
  (tests.h('XPLM2345'), 'a2700000-0000-0000-0000-000000000001', now() + interval '5 minutes');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select public.widget_pair(current_setting('tests.code1'), tests.h('tokA'), 'Pixel 8', null, null) ->> 'status'), 'ok', 'a live code pairs');
select is((select public.widget_pair(current_setting('tests.code0'), tests.h('tokX'), 'x', null, null) ->> 'status'), 'invalid', 'a replaced code is invalid');
select is((select public.widget_pair('ZZZZZZZZ', tests.h('tokX'), 'x', null, null) ->> 'status'), 'invalid', 'an unknown code is invalid');
select is((select public.widget_pair('abc', tests.h('tokX'), 'x', null, null) ->> 'status'), 'invalid', 'a malformed code is invalid');
select is((select public.widget_pair(null, tests.h('tokX'), 'x', null, null) ->> 'status'), 'invalid', 'a null code is invalid');
select is((select public.widget_pair('EXPD2345', tests.h('tokX'), 'x', null, null) ->> 'status'), 'invalid', 'an expired code is invalid');
select is((select public.widget_pair('GNNE2345', tests.h('tokX'), 'x', null, null) ->> 'status'), 'invalid', 'a code of a deleted profile is invalid');
select is((select public.widget_pair(current_setting('tests.code1'), tests.h('tokX'), 'x', null, null) ->> 'status'), 'invalid', 'a used code is invalid');
select throws_ok($$ select public.widget_pair('ZZZZZZZZ', 'not-a-hash', 'x', null, null) $$, 'P0001', 'invalid_token_hash', 'a token hash must be 64 hex characters');
select throws_ok($$ select public.widget_pair('ZZZZZZZZ', null, 'x', null, null) $$, 'P0001', 'invalid_token_hash', 'a null token hash is refused');
reset role;
select is((select count(*)::int from public.widget_tokens where user_id = 'a2700000-0000-0000-0000-000000000001'), 1, 'only the first pairing created a token');
select is((select label from public.widget_tokens where token_hash = tests.h('tokA')), 'Pixel 8', 'the label is stored');
select ok((select used_at is not null from public.widget_pairing_codes where code_hash = tests.h(current_setting('tests.code1'))), 'the code was consumed');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select public.widget_pair('nrmm-2345', tests.h('tokB'), 'Galaxy', null, null) ->> 'status'), 'ok', 'a lowercase code with a hyphen is normalized');
select is((select public.widget_pair('BLNK2345', tests.h('tokC'), '   ', null, null) ->> 'status'), 'ok', 'a blank label pairs');
select is((select public.widget_pair('USR22345', tests.h('tokF'), 'Otro', tests.h('tokC'), null) ->> 'status'), 'ok', 'another user pairs, naming a token that is not theirs as previous');
select is((select public.widget_pair('USR22345', tests.h('tokG'), 'Otro', null, null) ->> 'username'), null, 'a reused code returns no username');
reset role;
select is((select label from public.widget_tokens where token_hash = tests.h('tokC')), 'Android', 'a blank label becomes Android');
select ok((select revoked_at is null from public.widget_tokens where token_hash = tests.h('tokC')), 'previousToken of another user never revokes their token');
select is((select user_id from public.widget_tokens where token_hash = tests.h('tokF')), 'a2700000-0000-0000-0000-000000000002'::uuid, 'the token belongs to the code''s user');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select public.widget_pair('LNNG2345', tests.h('tokL'), repeat('x', 100), tests.h('tokB'), null) ->> 'status'), 'ok', 'at the cap, replacing a device of the same user succeeds');
reset role;
select is((select char_length(label) from public.widget_tokens where token_hash = tests.h('tokL')), 40, 'the label is cut to 40 characters');
select ok((select revoked_at is not null from public.widget_tokens where token_hash = tests.h('tokB')), 'the replaced token was revoked in the same call');
select is((select count(*)::int from public.widget_tokens where user_id = 'a2700000-0000-0000-0000-000000000001' and revoked_at is null), 3, 'three live tokens for A (A, C, L)');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select public.widget_pair('CAPP2345', tests.h('tokD'), 'Cuarto', null, null) ->> 'status'), 'limit_reached', 'a fourth device is refused');
select is((select public.widget_pair('CAPP2345', tests.h('tokD'), 'Cuarto', tests.h('tokNOPE'), null) ->> 'status'), 'limit_reached', 'a previousToken that matches nothing does not free a slot');
reset role;
select is((select count(*)::int from public.widget_tokens where token_hash = tests.h('tokD')), 0, 'no fourth token row exists');
select ok((select used_at is null from public.widget_pairing_codes where code_hash = tests.h('CAPP2345')), 'a refused pairing keeps the code usable');
-- rotation: revoke one as the owner, then the same code works
reset role;
select set_config('tests.tokL_id', (select id::text from public.widget_tokens where token_hash = tests.h('tokL')), true);
select set_config('tests.tokC_id', (select id::text from public.widget_tokens where token_hash = tests.h('tokC')), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select public.revoke_widget_token(current_setting('tests.tokL_id')::uuid)), false, 'another user cannot revoke the token');
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.widget_tokens), 3, 'the owner lists only their own live tokens');
select is((select public.revoke_widget_token(current_setting('tests.tokL_id')::uuid)), true, 'the owner revokes their token');
select is((select public.revoke_widget_token(current_setting('tests.tokL_id')::uuid)), false, 'revoking twice is a no-op');
select is((select count(*)::int from public.widget_tokens), 2, 'a revoked token disappears from the owner''s list');
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.revoke_widget_token(gen_random_uuid()) $$, '28000', 'not_authenticated', 'a deleted profile cannot revoke');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select public.revoke_widget_token(gen_random_uuid()) $$, '28000', 'not_authenticated', 'nor a request without a user');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select public.widget_pair('CAPP2345', tests.h('tokD'), 'Cuarto', null, null) ->> 'status'), 'ok', 'after a revoke the same code pairs: revoked tokens are not counted');
reset role;
select is((select count(*)::int from public.widget_tokens where user_id = 'a2700000-0000-0000-0000-000000000001' and revoked_at is null), 3, 'three live tokens again (A, C, D)');
select is((select count(*)::int from public.widget_tokens where token_hash ~ '^[0-9a-f]{64}$'), (select count(*)::int from public.widget_tokens), 'every stored token is a sha256 hex');

-- ============================================================ widget_pair: guessing limit per address
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*)::int from generate_series(1, 10) g
  where public.widget_pair('ZZZZZZZZ', tests.h('tokH'), 'x', null, 'wpair:addr:t-android-widget') ->> 'status' = 'invalid'), 10, 'ten wrong guesses are answered invalid');
select is((select public.widget_pair('ZZZZZZZZ', tests.h('tokH'), 'x', null, 'wpair:addr:t-android-widget') ->> 'status'), 'limited', 'the eleventh guess is limited');
select is((select public.widget_pair('XPLM2345', tests.h('tokH'), 'x', null, 'wpair:addr:t-android-widget') ->> 'status'), 'limited', 'even a right code from that address is limited');
reset role;
select ok((select used_at is null from public.widget_pairing_codes where code_hash = tests.h('XPLM2345')), 'a limited call does not consume the code');

-- ============================================================ widget_auth (service_role)
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select public.widget_auth(tests.h('tokC'), null, 'today') ->> 'status'), 'ok', 'a live token authenticates');
select is((select public.widget_auth(tests.h('tokC'), null, 'today') ->> 'user_id'), 'a2700000-0000-0000-0000-000000000001', 'the user comes from the token row');
select is((select public.widget_auth(tests.h('tokC'), null, 'checkin') ->> 'time_zone'), 'America/Santiago', 'the profile timezone comes with it');
select is((select public.widget_auth(tests.h('tokF'), null, 'today') ->> 'user_id'), 'a2700000-0000-0000-0000-000000000002', 'another token resolves to another user');
select is((select public.widget_auth(tests.h('tokNOPE'), null, 'today') ->> 'status'), 'invalid', 'an unknown token is invalid');
select is((select public.widget_auth(tests.h('tokB'), null, 'today') ->> 'status'), 'invalid', 'a revoked token is invalid');
select is((select public.widget_auth(tests.h('tokL'), null, 'today') ->> 'status'), 'invalid', 'a token revoked in Ajustes is invalid');
select throws_ok($$ select public.widget_auth(tests.h('tokC'), null, 'bogus') $$, 'P0001', 'invalid_scope', 'an unknown scope is refused');
reset role;
insert into public.widget_tokens (user_id, token_hash, label) values ('a2700000-0000-0000-0000-000000000003', tests.h('tokGone'), 'Android');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select public.widget_auth(tests.h('tokGone'), null, 'today') ->> 'status'), 'invalid', 'a token of a deleted profile is dead');
reset role;

-- last_used_at is written at most every ten minutes
update public.widget_tokens set last_used_at = null where token_hash = tests.h('tokC');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.widget_auth(tests.h('tokC'), null, 'today');
reset role;
select is((select last_used_at from public.widget_tokens where token_hash = tests.h('tokC')), now(), 'the first use stamps last_used_at');
update public.widget_tokens set last_used_at = now() - interval '5 minutes' where token_hash = tests.h('tokC');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.widget_auth(tests.h('tokC'), null, 'today');
reset role;
select is((select last_used_at from public.widget_tokens where token_hash = tests.h('tokC')), now() - interval '5 minutes', 'a use within ten minutes is not written');
update public.widget_tokens set last_used_at = now() - interval '11 minutes' where token_hash = tests.h('tokC');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.widget_auth(tests.h('tokC'), null, 'today');
reset role;
select is((select last_used_at from public.widget_tokens where token_hash = tests.h('tokC')), now(), 'a use after ten minutes is written');

-- limits
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*)::int from generate_series(1, 30) g
  where public.widget_auth(tests.h('tokNOPE'), 'wauth:addr:t-android-widget', 'today') ->> 'status' = 'invalid'), 30, 'thirty bad tokens from one address are answered invalid');
select is((select public.widget_auth(tests.h('tokNOPE'), 'wauth:addr:t-android-widget', 'today') ->> 'status'), 'limited', 'the thirty-first is limited');
select is((select public.widget_auth(tests.h('tokC'), 'wauth:addr:t-android-widget', 'today') ->> 'status'), 'ok', 'a valid token still authenticates when its address bucket is exhausted (shared NAT)');
select is((select count(*)::int from generate_series(1, 120) g where public.widget_auth(tests.h('tokD'), null, 'today') ->> 'status' = 'ok'), 120, 'a token reads today 120 times an hour');
select is((select public.widget_auth(tests.h('tokD'), null, 'today') ->> 'status'), 'limited', 'the 121st read is limited');
select is((select public.widget_auth(tests.h('tokD'), null, 'checkin') ->> 'status'), 'ok', 'the checkin budget is separate from the today budget');
select is((select count(*)::int from generate_series(1, 59) g where public.widget_auth(tests.h('tokD'), null, 'checkin') ->> 'status' = 'ok'), 59, 'a token checks in 60 times in ten minutes');
select is((select public.widget_auth(tests.h('tokD'), null, 'checkin') ->> 'status'), 'limited', 'the 61st check-in is limited');
select is((select public.widget_auth(tests.h('tokF'), null, 'today') ->> 'status'), 'ok', 'limits are per token');
reset role;

-- ============================================================ isolation and cascade
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2700000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.widget_tokens), 1, 'B sees only their own token');
select is((select count(*)::int from public.widget_tokens where user_id = 'a2700000-0000-0000-0000-000000000001'), 0, 'and none of A''s');
reset role;
insert into public.widget_tokens (user_id, token_hash, label) values ('a2700000-0000-0000-0000-000000000004', tests.h('tokCascade'), 'Android');
insert into public.widget_pairing_codes (code_hash, user_id, expires_at) values (tests.h('CASC2345'), 'a2700000-0000-0000-0000-000000000004', now() + interval '5 minutes');
delete from public.profiles where id = 'a2700000-0000-0000-0000-000000000004';
select is((select count(*)::int from public.widget_tokens where user_id = 'a2700000-0000-0000-0000-000000000004'), 0, 'deleting the profile cascades to its tokens');
select is((select count(*)::int from public.widget_pairing_codes where user_id = 'a2700000-0000-0000-0000-000000000004'), 0, 'and to its pairing codes');

select * from finish();
rollback;
