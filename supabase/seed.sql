-- Local development seed (supabase db reset). TEST DATA ONLY: never loaded in production.
--
-- Test users (password for both: kizuna-test-1)
--   user_a  user_a@example.com   Ana Prueba
--   user_b  user_b@example.com   Beto Prueba
--
-- user_a and user_b are friends, share an active weekly challenge (Leer vs Correr) and
-- user_b owes user_a one fine, so every main screen has something to show.

-- Users go through auth.users so the signup trigger creates the profiles.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated',
   'user_a@example.com', extensions.crypt('kizuna-test-1', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"username":"user_a","first_name":"Ana","last_name":"Prueba","birth_date":"1990-01-01","timezone":"America/Santiago","terms_accepted":true}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated',
   'user_b@example.com', extensions.crypt('kizuna-test-1', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"username":"user_b","first_name":"Beto","last_name":"Prueba","birth_date":"1990-01-01","timezone":"America/Santiago","terms_accepted":true}',
   now(), now(), '', '', '', '');

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.id in ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000b');

-- Dates are the owners' local dates (America/Santiago), like the app computes them.
create temp table seed_dates as
select (now() at time zone 'America/Santiago')::date as today,
       (date_trunc('week', now() at time zone 'America/Santiago') - interval '14 days')::date as starts_on;

insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000b', 'accepted');

insert into public.habits (id, user_id, name, icon, frequency_type, target_per_week, requires_photo, visibility, preset) values
  ('b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Leer', 'book', 'daily', null, false, 'public', 'read'),
  ('b0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'Gimnasio', 'barbell', 'weekly', 4, true, 'friends', 'gym'),
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b', 'Correr', 'sneaker-move', 'daily', null, false, 'friends', null);

-- Leer: a daily streak. Gimnasio: photo check-ins (the proof objects are not seeded, so
-- the feed shows them without an image).
insert into public.checkins (id, habit_id, user_id, local_date, photo_path)
select gen_random_uuid(), 'b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a',
       d.today - n, null
from seed_dates d, generate_series(0, 9) as n;

insert into public.checkins (id, habit_id, user_id, local_date, photo_path) values
  ('d0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a',
   (select today - 1 from seed_dates), 'a0000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a1.jpg'),
  ('d0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a',
   (select today - 3 from seed_dates), 'a0000000-0000-0000-0000-00000000000a/d0000000-0000-0000-0000-0000000000a2.jpg');

-- Correr: nothing in week 1 of the challenge (that is the seeded failure), three days in
-- week 2 and the current days of this week. A's Leer covers every ended week (see above).
insert into public.checkins (habit_id, user_id, local_date)
select 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b', d.starts_on + n
from seed_dates d, generate_series(7, 9) as n;
insert into public.checkins (habit_id, user_id, local_date)
select 'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b', d.today - n
from seed_dates d, generate_series(0, 2) as n
where d.today - n >= d.starts_on + 14;

-- Leer must also cover week 2 fully (the series above reaches back only 9 days).
insert into public.checkins (habit_id, user_id, local_date)
select 'b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', d.starts_on + n
from seed_dates d, generate_series(0, 13) as n
where d.starts_on + n < d.today - 9;

-- Active weekly challenge (3 per week, 4 weeks) that started two Mondays ago. Both ended
-- weeks are already closed, so /api/cron/close-periods creates nothing new: week 1 has
-- Beto's debt, week 2 was met by both.
insert into public.challenges (
  id, creator_id, rival_id, creator_habit_id, rival_habit_id, frequency_type, target_per_week,
  requires_photo, weeks, fine_amount, timezone, status, starts_on
) select
  'c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000b',
  'b0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'weekly', 3,
  false, 4, 2500, 'America/Santiago', 'active', d.starts_on
from seed_dates d;

insert into public.challenge_periods (challenge_id, period_start, period_end, closed_at)
select 'c0000000-0000-0000-0000-00000000000a', d.starts_on + w * 7, d.starts_on + w * 7 + 6, now() - interval '1 day'
from seed_dates d, generate_series(0, 1) as w;

insert into public.debts (challenge_id, period_start, debtor_id, creditor_id, amount)
select 'c0000000-0000-0000-0000-00000000000a', d.starts_on,
       'a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 2500
from seed_dates d;
