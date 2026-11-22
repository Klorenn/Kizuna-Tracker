begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a0000000-0000-0000-0000-000000000001', 'user_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-000000000002', 'user_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago');
insert into auth.users (id) values ('a0000000-0000-0000-0000-000000000004');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at) values
  ('a0000000-0000-0000-0000-000000000004', 'user_d', 'D', 'Test', '1990-01-01', now(), 'America/Santiago', now());
insert into public.habits (id, user_id, name, icon, frequency_type) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Gym A', 'barbell', 'daily'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Gym B', 'barbell', 'daily');
insert into public.goals (id, user_id, habit_id, kind, target) values
  ('90000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'weekly', 3);

-- starts_on follows the owner's timezone, not the UTC date
insert into auth.users (id) values ('a0000000-0000-0000-0000-000000000005');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a0000000-0000-0000-0000-000000000005', 'user_k', 'K', 'Test', '1990-01-01', now(), 'Pacific/Kiritimati');
insert into public.habits (id, user_id, name, icon, frequency_type) values
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'Gym K', 'barbell', 'daily');
insert into public.goals (id, user_id, habit_id, kind, target, starts_on) values
  ('90000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005', 'total', 10, '2000-01-01'),
  ('90000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'total', 10, '2000-01-01');
select is((select starts_on from public.goals where id = '90000000-0000-0000-0000-000000000005'),
  (now() at time zone 'Pacific/Kiritimati')::date, 'starts_on uses Pacific/Kiritimati local date');
select is((select starts_on from public.goals where id = '90000000-0000-0000-0000-000000000006'),
  (now() at time zone 'America/Santiago')::date, 'starts_on uses America/Santiago local date');
delete from public.goals where id = '90000000-0000-0000-0000-000000000006';

-- check constraints (as postgres)
select throws_ok(
  $$ insert into public.goals (user_id, habit_id, kind, target, deadline)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'weekly', 3, '2027-01-01') $$,
  '23514', null, 'weekly goal with a deadline violates the check');
select throws_ok(
  $$ insert into public.goals (user_id, habit_id, kind, target)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'weekly', 8) $$,
  '23514', null, 'weekly target above 7 violates the check');
select throws_ok(
  $$ insert into public.goals (user_id, habit_id, kind, target)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'total', 0) $$,
  '23514', null, 'target must be positive');

create schema tests;
create function tests.n(q text) returns int language plpgsql as $f$
declare c int;
begin
  execute 'with u as (' || q || ') select count(*)::int from u' into c;
  return c;
end $f$;
grant usage on schema tests to authenticated;
grant execute on function tests.n(text) to authenticated;

-- ===== D: deleted account =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.habits (user_id, name, icon, frequency_type)
     values ('a0000000-0000-0000-0000-000000000004', 'Nuevo', 'book', 'daily') $$,
  '42501', null, 'a deleted account cannot create habits');
reset role;

-- ===== A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.goals (user_id, habit_id, kind, target)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'weekly', 4) $$,
  'owner creates a goal on their own habit');
select is((select count(*)::int from public.goals), 1, 'a user does not see goals of others');
select throws_ok(
  $$ insert into public.goals (user_id, habit_id, kind, target)
     values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'weekly', 4) $$,
  '42501', null, 'a goal on someone elses habit is refused');
select is(tests.n($$ update public.goals set archived_at = now() where id = '90000000-0000-0000-0000-000000000002' returning 1 $$), 0,
  'a user cannot archive goals of others');

select throws_ok($$ update public.profiles set timezone = 'UTC' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'clients cannot update timezone directly');
select throws_ok($$ select public.set_timezone('Mars/Base') $$, 'P0001', 'invalid_timezone', 'invalid timezone is refused');
select lives_ok($$ select public.set_timezone('UTC') $$, 'set_timezone accepts a valid zone');
select throws_ok($$ select public.set_timezone('America/Bogota') $$, 'P0001', 'timezone_recently_changed',
  'a second change within 7 days is refused');
select is((select p.timezone from public.profiles p where p.id = 'a0000000-0000-0000-0000-000000000001'), 'UTC', 'the zone was updated');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('avatars', 'a0000000-0000-0000-0000-000000000002.jpg', 'a0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'a user cannot upload to someone elses avatar path');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('avatars', 'a0000000-0000-0000-0000-000000000001.jpg', 'a0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'clients cannot write avatars at all (server-only uploads)');

select * from finish();
rollback;
