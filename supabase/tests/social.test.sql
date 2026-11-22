begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000004');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at) values
  ('a0000000-0000-0000-0000-000000000001', 'user_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a0000000-0000-0000-0000-000000000002', 'user_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a0000000-0000-0000-0000-000000000003', 'user_c', 'C', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a0000000-0000-0000-0000-000000000004', 'user_d', 'D', 'Test', '1990-01-01', now(), 'America/Santiago', now());
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Leer', 'book', 'daily', true, 'public'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Gimnasio', 'barbell', 'daily', false, 'friends'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Diario', 'moon', 'daily', false, 'private'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'Borrado', 'book', 'daily', false, 'public');
insert into public.checkins (id, habit_id, user_id, local_date, photo_path) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   current_date - 1, 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000001.jpg'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   current_date - 2, null);
update public.checkins
  set rejected_at = now(), rejected_by = 'a0000000-0000-0000-0000-000000000002', reject_reason = 'unclear'
  where id = 'd0000000-0000-0000-0000-000000000002';
insert into public.invites (code, inviter_id, expires_at) values
  ('valid_code', 'a0000000-0000-0000-0000-000000000001', now() + interval '7 days'),
  ('old_code', 'a0000000-0000-0000-0000-000000000001', now() - interval '1 minute');
insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'pending');

-- ===== anon =====
set local role anon;
select is(jsonb_array_length(public.public_profile('user_a')->'habits'), 1, 'anon sees only the public habit');
select is((public.public_profile('user_a')->'habits'->0->'dates')::text, to_jsonb(array[to_char(current_date - 1, 'YYYY-MM-DD')])::text,
  'rejected check-in date is hidden');
select ok(public.public_profile('user_a')::text !~* 'photo|birth', 'json carries no photo or birth fields');
select throws_ok($$ select * from public.habits $$, '42501', null, 'anon cannot read habits');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs'), 0, 'anon sees no proofs');
select is(public.public_profile('user_c'), null, 'anon: user without public habits is null');
select is(public.public_profile('user_d'), null, 'anon: deleted user is null');
select is(public.public_profile('nobody_x'), null, 'anon: unknown user is null');
select throws_ok($$ select public.accept_invite('valid_code') $$, '42501', null, 'anon cannot accept invites');

-- ===== authenticated =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(public.public_profile('user_c')->'habits', '[]'::jsonb, 'authenticated: no public habits gives empty list');
select is(public.public_profile('user_d'), null, 'authenticated: deleted user is null');
select throws_ok($$ select public.accept_invite('old_code') $$, 'P0001', 'invite_expired', 'expired invite');
select throws_ok($$ select public.accept_invite('nope') $$, 'P0001', 'invite_not_found', 'unknown invite');
select is(public.accept_invite('valid_code'), 'a0000000-0000-0000-0000-000000000001'::uuid, 'valid invite returns the inviter');
select is((select status from public.friendships where requester_id = 'a0000000-0000-0000-0000-000000000001'
  and addressee_id = 'a0000000-0000-0000-0000-000000000003'), 'accepted', 'friendship accepted');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.accept_invite('valid_code') $$, 'P0001', 'invite_self', 'own invite');

select * from finish();
rollback;
