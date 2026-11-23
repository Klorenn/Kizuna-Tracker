begin;
-- supabase/seed.sql loads local test users; these tests build their own fixtures inside
-- this transaction, so clear the seed first (rolled back at the end).
truncate public.profiles cascade;
delete from auth.users where email like '%@example.com';
create extension if not exists pgtap with schema extensions;
select plan(62);

-- Fixtures. ana (01) is the caller.
--   01 ana        caller
--   02 bruno_b    accepted friend of ana
--   03 dani_d     accepted friend of ana
--   04 carla_c    stranger, accepted friend of 02, 03 and 06
--   05 jose_n     "José Núñez", stranger, 1 day old
--   06 gone_g     deleted profile, accepted friend of ana and of carla
--   07 hidden_h   discoverable = false, stranger
--   08 out_o      ana sent a pending request
--   09 in_i       sent a pending request to ana
--   10 old_o      stranger created 15 days ago
--   11 pia_p      stranger, only a PENDING friendship with bruno
--   12 jose_nx    "Zed Extra", stranger, 1 hour old
insert into auth.users (id)
select ('c0000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 12) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at, discoverable, created_at) values
  ('c0000000-0000-0000-0000-000000000001', 'ana',      'Ana',    'Caller',  '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '30 days'),
  ('c0000000-0000-0000-0000-000000000002', 'bruno_b',  'Bruno',  'Amigo',   '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '30 days'),
  ('c0000000-0000-0000-0000-000000000003', 'dani_d',   'Dani',   'Amiga',   '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '30 days'),
  ('c0000000-0000-0000-0000-000000000004', 'carla_c',  'Carla',  'Mora',    '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '10 days'),
  ('c0000000-0000-0000-0000-000000000005', 'jose_n',   'José',   'Núñez',   '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '1 day'),
  ('c0000000-0000-0000-0000-000000000006', 'gone_g',   'Gone',   'Person',  '1990-01-01', now(), 'America/Santiago', now(), true,  now() - interval '30 days'),
  ('c0000000-0000-0000-0000-000000000007', 'hidden_h', 'Hidden', 'Person',  '1990-01-01', now(), 'America/Santiago', null,  false, now() - interval '30 days'),
  ('c0000000-0000-0000-0000-000000000008', 'out_o',    'Out',    'Bound',   '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '2 days'),
  ('c0000000-0000-0000-0000-000000000009', 'in_i',     'In',     'Coming',  '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '3 days'),
  ('c0000000-0000-0000-0000-000000000010', 'old_o',    'Vieja',  'Otra',    '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '15 days'),
  ('c0000000-0000-0000-0000-000000000011', 'pia_p',    'Pia',    'Pending', '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '4 days'),
  ('c0000000-0000-0000-0000-000000000012', 'jose_nx',  'Zed',    'Extra',   '1990-01-01', now(), 'America/Santiago', null,  true,  now() - interval '1 hour');
insert into public.friendships (requester_id, addressee_id, status) values
  ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'accepted'),
  ('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'accepted'),
  ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000006', 'accepted'),
  ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'accepted'),
  ('c0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'accepted'),
  ('c0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', 'accepted'),
  ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000008', 'pending'),
  ('c0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 'pending'),
  ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000011', 'pending');

-- ===== the switch (column) =====
select is((select column_default from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'discoverable'), 'true', 'discoverable defaults to true');
select is((select is_nullable from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'discoverable'), 'NO', 'discoverable is not null');
select is((select count(*)::int from public.profiles where discoverable), 11, 'every account except the one set to false is discoverable');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'public_profiles'), 5, 'public_profiles still has exactly 5 columns');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'public_profiles' and column_name = 'discoverable'), 0, 'discoverable is not in public_profiles');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.profiles set discoverable = false where id = 'c0000000-0000-0000-0000-000000000001';
select is((select discoverable from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'), false, 'owner can switch discoverable off');
update public.profiles set discoverable = true where id = 'c0000000-0000-0000-0000-000000000001';
select is((select discoverable from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'), true, 'owner can switch discoverable back on');
update public.profiles set discoverable = true where id = 'c0000000-0000-0000-0000-000000000007';
select is((select count(*)::int from public.profiles where id = 'c0000000-0000-0000-0000-000000000007'), 0, 'nobody else can read the profile row (and its switch)');
reset role;
select is((select discoverable from public.profiles where id = 'c0000000-0000-0000-0000-000000000007'), false, 'another user UPDATE of discoverable changed 0 rows');

-- ===== execute rights and session =====
reset role;
set local role anon;
select throws_ok($$ select * from public.discover_people() $$, '42501', null, 'anon cannot execute discover_people');
reset role;
set local role authenticated;
select throws_ok($$ select public.discover_fold('José') $$, '42501', null, 'clients cannot call the fold helper');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select * from public.discover_people() $$, 'P0001', 'not_authenticated', 'no session raises not_authenticated');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- ===== listing =====
select is((select array_agg(d.username order by d.username) from public.discover_people() d),
  array['carla_c', 'in_i', 'jose_n', 'jose_nx', 'old_o', 'out_o', 'pia_p'],
  'lists strangers and pending counterparts; not the caller, deleted, accepted friends or hidden profiles');
select is((select d.relation from public.discover_people() d where d.username = 'out_o'), 'outgoing', 'relation outgoing');
select is((select d.relation from public.discover_people() d where d.username = 'in_i'), 'incoming', 'relation incoming');
select is((select d.relation from public.discover_people() d where d.username = 'jose_n'), 'none', 'relation none');
select is((select count(*)::int from public.discover_people() d where d.username in ('ana', 'bruno_b', 'dani_d', 'gone_g', 'hidden_h')), 0,
  'caller, accepted friends, deleted and hidden people are absent');
select ok((select d.avatar_preset between 1 and 8 from public.discover_people() d where d.username = 'jose_n'), 'avatar preset is returned');

-- ===== discoverable = false: exact username only =====
select is((select d.username from public.discover_people('hidden_h') d), 'hidden_h', 'hidden profile is found by its exact username');
select is((select count(*)::int from public.discover_people('hidden_') d), 0, 'hidden profile is not found by a username prefix');
select is((select count(*)::int from public.discover_people('hidden person') d), 0, 'hidden profile is not found by display name');
select is((select count(*)::int from public.discover_people('@HIDDEN_H') d), 1, 'exact username query is normalised (@, case)');

-- ===== name and username search =====
select is((select array_agg(d.username order by d.username) from public.discover_people('jose') d), array['jose_n', 'jose_nx'], '"jose" finds José Núñez (accents folded) and the username prefix');
select is((select array_agg(d.username) from public.discover_people('nunez') d), array['jose_n'], '"nunez" finds José Núñez');
select is((select array_agg(d.username) from public.discover_people('NÚÑEZ') d), array['jose_n'], 'upper-case accented query folds too');
select is((select array_agg(d.username order by d.username) from public.discover_people('jo') d), array['jose_n', 'jose_nx'], 'username prefix "jo" finds jose_n');
select is((select count(*)::int from public.discover_people('%%') d), 0, '%% matches literally (nobody)');
select is((select count(*)::int from public.discover_people('jo_') d), 0, '_ matches literally, not as a wildcard');
select is((select count(*)::int from public.discover_people('j\') d), 0, 'a backslash matches literally');

-- ===== query validation =====
select throws_ok($$ select * from public.discover_people('a') $$, 'P0001', 'invalid_query', 'one character is invalid');
select throws_ok($$ select * from public.discover_people(repeat('a', 41)) $$, 'P0001', 'invalid_query', '41 characters is invalid');
select is((select count(*)::int from public.discover_people(repeat('a', 40)) d), 0, '40 characters is accepted');
select is((select count(*)::int from public.discover_people('  @Ana ') d), 0, '"  @Ana " behaves as ana (the caller is never listed)');
select is((select array_agg(d.username) from public.discover_people('  @Carla_C ') d), array['carla_c'], 'trim, leading @ and case are normalised');
select is((select count(*)::int from public.discover_people('') d), 7, 'empty string behaves as no query');
select is((select count(*)::int from public.discover_people('@') d), 7, 'a lone @ behaves as no query');

-- ===== mutual_count =====
select is((select d.mutual_count from public.discover_people() d where d.username = 'carla_c'), 2, 'carla has 2 friends in common (deleted friend not counted)');
select is((select d.mutual_count from public.discover_people() d where d.username = 'pia_p'), 0, 'a pending friendship never counts');
select is((select d.mutual_count from public.discover_people() d where d.username = 'jose_n'), 0, 'no friends in common is 0');

-- ===== order =====
select is((select array_agg(d.username order by d.n) from (select d.username, row_number() over () as n from public.discover_people() d) d),
  array['carla_c', 'jose_nx', 'jose_n', 'out_o', 'in_i', 'pia_p', 'old_o'],
  'order: more friends in common, then newest profile');
select is((select d.username from public.discover_people('jose_n') d limit 1), 'jose_n', 'an exact username match comes first even if another match is newer');

-- ===== is_new =====
select is((select d.is_new from public.discover_people() d where d.username = 'jose_n'), true, 'is_new for a profile created a day ago');
select is((select d.is_new from public.discover_people() d where d.username = 'old_o'), false, 'not new after 15 days');

-- ===== limit / offset clamps =====
select is((select count(*)::int from public.discover_people(null, 0, 0) d), 1, 'limit 0 returns 1 row');
select is((select count(*)::int from public.discover_people(null, 500, 0) d), 7, 'limit 500 is clamped to 50 (all 7 here)');
select is((select count(*)::int from public.discover_people(null, 3, 0) d), 3, 'limit 3 returns 3');
select is((select array_agg(d.username) from public.discover_people(null, 2, -5) d), array['carla_c', 'jose_nx'], 'offset -5 behaves as 0');
select is((select count(*)::int from public.discover_people(null, 20, 5000) d), 0, 'offset 5000 returns nothing');
select is((select array_agg(d.username) from public.discover_people(null, 2, 2) d), array['jose_n', 'out_o'], 'offset pages through the same order');

-- ===== friends in common: the switch governs the count =====
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
update public.profiles set discoverable = false where id = 'c0000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select d.mutual_count from public.discover_people() d where d.username = 'carla_c'), 1, 'a friend with discoverable = false is not counted');
select is((select count(*)::int from public.discover_people() d where d.username = 'dani_d'), 0, 'and an accepted friend is still never listed');

-- ===== a stranger sees nothing of other people's friendships =====
select is((select count(*)::int from public.friendships
  where requester_id = 'c0000000-0000-0000-0000-000000000002' and addressee_id = 'c0000000-0000-0000-0000-000000000004'), 0,
  'ana sees 0 rows of the bruno-carla friendship');
select is((select count(*)::int from public.friendships), 5, 'ana sees only her own 5 friendship rows');

-- ===== the cap of 20 pending requests =====
reset role;
insert into auth.users (id)
select ('c1000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 24) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
select ('c1000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'cap_' || lpad(g::text, 2, '0'),
  'Cap', 'User', '1990-01-01', now(), 'America/Santiago'
from generate_series(1, 24) g;
-- cap_01 is the requester; cap_02 .. cap_24 are targets
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$
  insert into public.friendships (requester_id, addressee_id, status)
  select 'c1000000-0000-0000-0000-000000000001', ('c1000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'pending'
  from generate_series(2, 21) g
$$, '20 pending requests from one requester succeed');
select throws_ok($$
  insert into public.friendships (requester_id, addressee_id, status)
  values ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000022', 'pending')
$$, 'P0001', 'request_limit', 'the 21st pending request raises request_limit');
delete from public.friendships
  where requester_id = 'c1000000-0000-0000-0000-000000000001' and addressee_id = 'c1000000-0000-0000-0000-000000000021';
select lives_ok($$
  insert into public.friendships (requester_id, addressee_id, status)
  values ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000022', 'pending')
$$, 'after withdrawing one, a new request succeeds');
select throws_ok($$
  insert into public.friendships (requester_id, addressee_id, status)
  values ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000023', 'pending')
$$, 'P0001', 'request_limit', 'back at 20 the cap holds again');

-- an accepted request frees a slot (accepted rows never count)
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
update public.friendships set status = 'accepted'
  where requester_id = 'c1000000-0000-0000-0000-000000000001' and addressee_id = 'c1000000-0000-0000-0000-000000000002';
select is((select status from public.friendships where requester_id = 'c1000000-0000-0000-0000-000000000001'
  and addressee_id = 'c1000000-0000-0000-0000-000000000002'), 'accepted', 'the addressee can still accept at the cap');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$
  insert into public.friendships (requester_id, addressee_id, status)
  values ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000023', 'pending')
$$, 'after one is accepted, a new request succeeds');

-- accept_invite inserts an ACCEPTED row for an inviter who has 20 pending: unaffected
reset role;
insert into public.invites (code, inviter_id, expires_at)
values ('cap_code', 'c1000000-0000-0000-0000-000000000001', now() + interval '7 days');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000024","role":"authenticated"}', true);
select is(public.accept_invite('cap_code'), 'c1000000-0000-0000-0000-000000000001'::uuid, 'accept_invite succeeds for an inviter at the cap');
select is((select status from public.friendships where requester_id = 'c1000000-0000-0000-0000-000000000001'
  and addressee_id = 'c1000000-0000-0000-0000-000000000024'), 'accepted', 'and the row is accepted');
reset role;
select is((select count(*)::int from public.friendships
  where requester_id = 'c1000000-0000-0000-0000-000000000001' and status = 'pending'), 20, 'the requester still has exactly 20 pending rows');

select * from finish();
rollback;
