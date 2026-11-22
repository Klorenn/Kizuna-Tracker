begin;
-- supabase/seed.sql loads local test users; these tests build their own fixtures inside
-- this transaction, so clear the seed first (rolled back at the end).
truncate public.profiles cascade;
delete from auth.users where email like '%@example.com';
create extension if not exists pgtap with schema extensions;
select plan(35);

-- A owner, B accepted friend, D deleted account
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000004');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at) values
  ('a0000000-0000-0000-0000-000000000001', 'user_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a0000000-0000-0000-0000-000000000002', 'user_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago', null),
  ('a0000000-0000-0000-0000-000000000004', 'user_d', 'D', 'Test', '1990-01-01', now(), 'America/Santiago', now());
insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'accepted');

insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility, preset) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Privado', 'book', 'daily', true, 'private', null),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Amigos', 'book', 'daily', true, 'friends', null),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Comer bien', 'fork-knife', 'daily', false, 'friends', 'eat_well'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'En reto', 'barbell', 'daily', false, 'friends', null),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Pasos con foto', 'camera', 'daily', false, 'friends', null),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Privado con pasos', 'moon', 'daily', false, 'private', null),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002', 'Rival', 'barbell', 'daily', false, 'friends', null),
  ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000004', 'Borrado', 'book', 'daily', false, 'friends', null);
insert into public.habit_items (id, habit_id, user_id, label, position, requires_photo) values
  ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Desayuno', 0, false),
  ('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Almuerzo', 1, false),
  ('f0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Once', 2, false),
  ('f0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Cena', 3, false),
  ('f0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Comida', 0, true),
  ('f0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Secreto', 0, false);
insert into public.checkins (id, habit_id, user_id, local_date, photo_path) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-11-20',
   'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000001.jpg'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-11-20',
   'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000002.jpg');
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, requires_photo, weeks, fine_amount, timezone, status)
values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000007', 'daily', false, 4, 5000, 'America/Santiago', 'active');
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility) values
  ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'Gym reto', 'barbell', 'daily', true, 'friends'),
  ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Con reto foto', 'book', 'daily', false, 'friends'),
  ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Gym libre', 'barbell', 'daily', true, 'friends');
insert into public.habit_items (id, habit_id, user_id, label, position, requires_photo) values
  ('f0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Paso', 0, false),
  ('f0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Colado', 0, false);
insert into public.challenges (id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, requires_photo, weeks, fine_amount, timezone, status)
values
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000007', 'daily', true, 4, 5000, 'America/Santiago', 'active'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000007', 'daily', true, 4, 5000, 'America/Santiago', 'proposed');
insert into storage.objects (bucket_id, name, owner) values
  ('proofs', 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000001.jpg', 'a0000000-0000-0000-0000-000000000001'),
  ('proofs', 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-000000000002.jpg', 'a0000000-0000-0000-0000-000000000001');

create schema tests;
create function tests.n(q text) returns int language plpgsql as $f$
declare c int;
begin
  execute 'with u as (' || q || ') select count(*)::int from u' into c;
  return c;
end $f$;
grant usage on schema tests to authenticated;
grant execute on function tests.n(text) to authenticated;

-- ===== B: accepted friend =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from public.habits where id = 'b0000000-0000-0000-0000-000000000001'), 0, 'friend does not see a private habit');
select is((select count(*)::int from public.habits where id = 'b0000000-0000-0000-0000-000000000002'), 1, 'friend sees a friends habit');
select is((select count(*)::int from public.checkins where habit_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'friend does not see check-ins of a private habit');
select is((select count(*)::int from public.checkins where habit_id = 'b0000000-0000-0000-0000-000000000002'), 1, 'friend sees check-ins of a friends habit');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name like '%d0000000-0000-0000-0000-000000000001.jpg'), 0,
  'friend cannot read the proof of a private habit');
select is((select count(*)::int from storage.objects where bucket_id = 'proofs' and name like '%d0000000-0000-0000-0000-000000000002.jpg'), 1,
  'friend reads the proof of a friends habit');
select is((select count(*)::int from public.habit_items where habit_id = 'b0000000-0000-0000-0000-000000000006'), 0, 'friend does not see items of a private habit');
select is((select count(*)::int from public.habit_items where habit_id = 'b0000000-0000-0000-0000-000000000003'), 4, 'friend sees items of a friends habit');
select throws_ok($$ select * from public.check_item('f0000000-0000-0000-0000-000000000001') $$, 'P0001', 'item_not_found',
  'check_item on someone elses item fails');
select throws_ok(
  $$ insert into public.checkin_items (item_id, habit_id, user_id, local_date)
     values ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', '2026-11-20') $$,
  '42501', null, 'authenticated cannot insert checkin_items');
select is(tests.n($$ update public.habits set visibility = 'public' where id = 'b0000000-0000-0000-0000-000000000002' returning 1 $$), 0,
  'friend cannot change someone elses visibility');

-- ===== A: owner =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select day_completed from public.check_item('f0000000-0000-0000-0000-000000000001')), false, 'item 1: day not complete');
select is((select day_completed from public.check_item('f0000000-0000-0000-0000-000000000002')), false, 'item 2: day not complete');
select is((select day_completed from public.check_item('f0000000-0000-0000-0000-000000000003')), false, 'item 3: day not complete');
select is((select count(*)::int from public.checkins where habit_id = 'b0000000-0000-0000-0000-000000000003'), 0, 'no check-in before the last item');
select is((select day_completed from public.check_item('f0000000-0000-0000-0000-000000000004')), true, 'item 4: day complete');
select is((select count(*)::int from public.checkins where habit_id = 'b0000000-0000-0000-0000-000000000003'
  and local_date = (now() at time zone 'America/Santiago')::date), 1, 'completing the day creates one check-in for today');
select is((select created from public.check_item('f0000000-0000-0000-0000-000000000004')), false, 'repeating check_item is idempotent');
select throws_ok($$ select * from public.check_item('f0000000-0000-0000-0000-000000000005') $$, 'P0001', 'photo_required',
  'an item that asks for a photo cannot be checked without one');
select throws_ok($$ select * from public.create_checkin('b0000000-0000-0000-0000-000000000003') $$, 'P0001', 'habit_has_items',
  'create_checkin on a habit with items fails');

select lives_ok($$ select public.uncheck_item('f0000000-0000-0000-0000-000000000004') $$, 'uncheck_item works');
select is((select count(*)::int from public.checkins where habit_id = 'b0000000-0000-0000-0000-000000000003'
  and local_date = (now() at time zone 'America/Santiago')::date), 0, 'unchecking removes the check-in of today');
select is((select count(*)::int from public.checkin_items where habit_id = 'b0000000-0000-0000-0000-000000000003'), 3, 'other items stay checked');

-- rejected check-in blocks undo
select public.check_item('f0000000-0000-0000-0000-000000000004');
reset role;
update public.checkins set rejected_at = now(), rejected_by = 'a0000000-0000-0000-0000-000000000002', reject_reason = 'other'
  where habit_id = 'b0000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.uncheck_item('f0000000-0000-0000-0000-000000000004') $$, 'P0001', 'checkin_rejected',
  'a rejected check-in cannot be undone');

-- visibility guard
select throws_ok($$ update public.habits set visibility = 'private' where id = 'b0000000-0000-0000-0000-000000000004' $$,
  'P0001', 'habit_in_challenge', 'a habit in an active challenge cannot become private');
select lives_ok($$ update public.habits set visibility = 'private' where id = 'b0000000-0000-0000-0000-000000000002' $$,
  'a free habit can become private');
select lives_ok($$ update public.habits set visibility = 'public' where id = 'b0000000-0000-0000-0000-000000000004' $$,
  'a habit in a challenge can become public');
select throws_ok($$ update public.habits set visibility = 'secret' where id = 'b0000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'visibility is constrained');

-- photo habits cannot be completed through items
select throws_ok(
  $$ insert into public.habit_items (habit_id, user_id, label, position)
     values ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'X', 5) $$,
  '42501', null, 'cannot add an item to a habit that requires a photo');
select throws_ok($$ update public.habits set requires_photo = true where id = 'b0000000-0000-0000-0000-000000000003' $$,
  'P0001', 'photo_conflict', 'cannot require a photo on a habit with active items');
select throws_ok($$ select * from public.check_item('f0000000-0000-0000-0000-000000000008') $$, 'P0001', 'photo_required',
  'check_item refuses items of a habit that requires a photo');
-- challenge guards
select throws_ok(
  $$ insert into public.habit_items (habit_id, user_id, label, position)
     values ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Otro', 5) $$,
  'P0001', 'habit_in_challenge', 'cannot add items to a habit in a photo challenge');
select throws_ok($$ update public.habit_items set archived_at = now() where id = 'f0000000-0000-0000-0000-000000000007' $$,
  'P0001', 'habit_in_challenge', 'cannot archive items of a habit in a photo challenge');
select throws_ok($$ update public.habits set requires_photo = false where id = 'b0000000-0000-0000-0000-000000000009' $$,
  'P0001', 'habit_in_challenge', 'cannot drop the photo requirement of a habit in a photo challenge');

-- ===== D: deleted profile =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$ select * from public.create_checkin('b0000000-0000-0000-0000-000000000008') $$, '28000', 'not_authenticated',
  'a deleted account cannot check in');

select * from finish();
rollback;
