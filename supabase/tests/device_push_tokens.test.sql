begin;
-- Native push: device_push_tokens (Expo tokens, one row per device) and expo_push_tickets (receipts to check).
-- Every server-side call below runs AS service_role (the role /api/m/push-token, sendPush and the
-- reminders cron use), so a missing grant fails here and not silently in production with 42501.
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Fixtures: 1 and 2 live users, 3 deleted at the end (cascade), 4 has only a device token (no web push).
insert into auth.users (id) values
  ('d9000000-0000-0000-0000-000000000001'),
  ('d9000000-0000-0000-0000-000000000002'),
  ('d9000000-0000-0000-0000-000000000003'),
  ('d9000000-0000-0000-0000-000000000004'),
  ('d9000000-0000-0000-0000-000000000005');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at) values
  ('d9000000-0000-0000-0000-000000000001', 'dpt_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('d9000000-0000-0000-0000-000000000002', 'dpt_b', 'B', 'Test', '1990-01-01', now(), 'Europe/Madrid', null),
  ('d9000000-0000-0000-0000-000000000003', 'dpt_c', 'C', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('d9000000-0000-0000-0000-000000000004', 'dpt_dev', 'D', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('d9000000-0000-0000-0000-000000000005', 'dpt_none', 'N', 'Test', '1990-01-01', now(), 'America/Santiago', null);

-- ============================================================ shape
select has_table('public', 'device_push_tokens', 'device_push_tokens exists');
select has_table('public', 'expo_push_tickets', 'expo_push_tickets exists');
select ok((select relrowsecurity from pg_class where oid = 'public.device_push_tokens'::regclass), 'RLS is on for device_push_tokens');
select ok((select relrowsecurity from pg_class where oid = 'public.expo_push_tickets'::regclass), 'RLS is on for expo_push_tickets');

-- ============================================================ grants
select ok(has_table_privilege('authenticated', 'public.device_push_tokens', 'SELECT'), 'authenticated can read tokens (own rows by RLS)');
select ok(has_table_privilege('authenticated', 'public.device_push_tokens', 'DELETE'), 'authenticated can delete tokens (own rows by RLS)');
select ok(not has_table_privilege('authenticated', 'public.device_push_tokens', 'INSERT'), 'authenticated cannot insert tokens');
select ok(not has_table_privilege('authenticated', 'public.device_push_tokens', 'UPDATE'), 'authenticated cannot update tokens');
select ok(not has_table_privilege('anon', 'public.device_push_tokens', 'SELECT'), 'anon cannot read tokens');
select ok(has_table_privilege('service_role', 'public.device_push_tokens', 'SELECT')
  and has_table_privilege('service_role', 'public.device_push_tokens', 'INSERT')
  and has_table_privilege('service_role', 'public.device_push_tokens', 'UPDATE')
  and has_table_privilege('service_role', 'public.device_push_tokens', 'DELETE'), 'service_role has full access to tokens');
select ok(not has_table_privilege('authenticated', 'public.expo_push_tickets', 'SELECT'), 'authenticated cannot read tickets');
select ok(not has_table_privilege('anon', 'public.expo_push_tickets', 'SELECT'), 'anon cannot read tickets');
select ok(has_table_privilege('service_role', 'public.expo_push_tickets', 'SELECT')
  and has_table_privilege('service_role', 'public.expo_push_tickets', 'INSERT')
  and has_table_privilege('service_role', 'public.expo_push_tickets', 'DELETE'), 'service_role has full access to tickets');

-- ============================================================ the route and sendPush paths, AS service_role
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$ insert into public.device_push_tokens (user_id, token) values
  ('d9000000-0000-0000-0000-000000000001', 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]') $$, 'service_role: register a token');
select lives_ok($$ insert into public.device_push_tokens (user_id, token) values
  ('d9000000-0000-0000-0000-000000000001', 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]') $$, 'service_role: the ExpoPushToken[...] spelling is accepted');
select lives_ok($$ insert into public.device_push_tokens (user_id, token) values
  ('d9000000-0000-0000-0000-000000000003', 'ExponentPushToken[cccccccccccccccccccccc]'),
  ('d9000000-0000-0000-0000-000000000004', 'ExponentPushToken[dddddddddddddddddddddd]') $$, 'service_role: more devices');
select throws_ok($$ insert into public.device_push_tokens (user_id, token) values
  ('d9000000-0000-0000-0000-000000000002', 'not-a-token') $$, '23514', null, 'a malformed token is refused');
select throws_ok($$ insert into public.device_push_tokens (user_id, token) values
  ('d9000000-0000-0000-0000-000000000002', 'ExponentPushToken[short]') $$, '23514', null, 'a too short token is refused');
select throws_ok($$ insert into public.device_push_tokens (user_id, token) values
  ('d9000000-0000-0000-0000-000000000002', 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]') $$, '23505', null, 'the same token cannot be inserted twice');
-- the account switch: the same device token moves to another user (the route upserts on token)
select lives_ok($$ insert into public.device_push_tokens (user_id, token, last_seen_at)
  values ('d9000000-0000-0000-0000-000000000002', 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', now())
  on conflict (token) do update set user_id = excluded.user_id, last_seen_at = excluded.last_seen_at $$, 'service_role: upsert on token reassigns the device');
select is((select user_id from public.device_push_tokens where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'),
  'd9000000-0000-0000-0000-000000000002'::uuid, 'the token now belongs to the second user');
select is((select count(*)::int from public.device_push_tokens where user_id = 'd9000000-0000-0000-0000-000000000001'), 1,
  'the first user keeps only their other device');
select lives_ok($$ select token from public.device_push_tokens where user_id = 'd9000000-0000-0000-0000-000000000001' $$, 'service_role: list tokens of a user');
select lives_ok($$ delete from public.device_push_tokens where token = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]' $$, 'service_role: delete a token (DeviceNotRegistered)');
select lives_ok($$ insert into public.expo_push_tickets (ticket_id, token) values
  ('11111111-1111-1111-1111-111111111111', 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'),
  ('22222222-2222-2222-2222-222222222222', 'ExponentPushToken[cccccccccccccccccccccc]') $$, 'service_role: save tickets');
select lives_ok($$ update public.expo_push_tickets set created_at = now() - interval '2 hours' where ticket_id = '11111111-1111-1111-1111-111111111111' $$, 'service_role: age a ticket');
select is((select array_agg(ticket_id order by ticket_id) from public.expo_push_tickets where created_at < now() - interval '15 minutes'),
  array['11111111-1111-1111-1111-111111111111'], 'service_role: only tickets older than 15 minutes are due for a receipt');
select lives_ok($$ delete from public.expo_push_tickets where ticket_id = '11111111-1111-1111-1111-111111111111' $$, 'service_role: delete a processed ticket');
select is((select count(*)::int from public.expo_push_tickets), 1, 'one ticket is left');
reset role;

-- ============================================================ RLS: the owner reads and deletes only their own rows
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d9000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.device_push_tokens), 1, 'the owner sees only their own token');
select throws_ok($$ insert into public.device_push_tokens (user_id, token) values
  ('d9000000-0000-0000-0000-000000000003', 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]') $$, '42501', null, 'the owner cannot insert (the route does it as service_role)');
select throws_ok($$ select count(*) from public.expo_push_tickets $$, '42501', null, 'the owner cannot read tickets');
delete from public.device_push_tokens where user_id = 'd9000000-0000-0000-0000-000000000002';
reset role;
select is((select count(*)::int from public.device_push_tokens where user_id = 'd9000000-0000-0000-0000-000000000002'), 1, 'the owner cannot delete someone else''s token');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d9000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
delete from public.device_push_tokens where user_id = 'd9000000-0000-0000-0000-000000000003';
reset role;
select is((select count(*)::int from public.device_push_tokens where user_id = 'd9000000-0000-0000-0000-000000000003'), 0, 'the owner deletes their own token (logout)');

-- ============================================================ notification_targets counts device tokens
-- user 4 has a device token and no web subscription; user 5 has neither
select is((select count(*)::int from public.notification_targets('streak_risk') where user_id = 'd9000000-0000-0000-0000-000000000004'), 1,
  'streak_risk: a user with only a device token is a target');
select is((select count(*)::int from public.notification_targets('weekly_summary') where user_id = 'd9000000-0000-0000-0000-000000000004'), 1,
  'weekly_summary: a user with only a device token is a target');
select is((select count(*)::int from public.notification_targets('streak_risk') where user_id = 'd9000000-0000-0000-0000-000000000005'), 0,
  'a user with no push channel at all is not a target');

-- ============================================================ cascade
delete from auth.users where id = 'd9000000-0000-0000-0000-000000000004';
select is((select count(*)::int from public.device_push_tokens where user_id = 'd9000000-0000-0000-0000-000000000004'), 0,
  'deleting the user removes their tokens');

select * from finish();
rollback;
