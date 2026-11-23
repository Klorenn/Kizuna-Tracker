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

insert into public.habits (id, user_id, name, icon, frequency_type, target_per_week, requires_photo, visibility, preset, color) values
  ('b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Leer', 'book', 'daily', null, false, 'public', 'read', 'arena'),
  ('b0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'Gimnasio', 'barbell', 'weekly', 4, true, 'friends', 'gym', 'durazno'),
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b', 'Correr', 'sneaker-move', 'daily', null, false, 'friends', null, 'salvia');

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

-- ============================================================ detailed logs and body (v3)
-- Self-contained and idempotent (deterministic ids, ON CONFLICT DO NOTHING, guarded inserts),
-- so it can also be applied on its own to an existing local database:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f <this block>
-- Dates are relative to today in America/Santiago: m0 = first day of this month, m1 / m2 = one
-- and two months before. user_a reads (Leer) and trains (Gimnasio); everything is private.
-- Expectations used by tests/e2e/logs.spec.ts: this month 26 pages (Dune 14 -> 40 today),
-- Dune "40 de 412", "El nombre del viento" finished in m1, pierna +40 kg this month
-- (Sentadilla 60 -> 80, Prensa 100 -> 120, Extensión nueva), latest weight 71,9 kg today.
drop table if exists seed_log_dates;
create temp table seed_log_dates as
select t.today,
       date_trunc('month', t.today)::date as m0,
       (date_trunc('month', t.today) - interval '1 month')::date as m1,
       (date_trunc('month', t.today) - interval '2 months')::date as m2
from (select (now() at time zone 'America/Santiago')::date as today) t;

update public.habits set log_type = 'reading'
where id = 'b0000000-0000-0000-0000-00000000000a' and log_type <> 'reading';
update public.habits set log_type = 'workout'
where id = 'b0000000-0000-0000-0000-0000000000a2' and log_type <> 'workout';

-- Books: Dune (reading), two finished on m1 + 17 and m2 + 17.
insert into public.books (id, user_id, title, author, total_pages, status, finished_on)
select v.id, 'a0000000-0000-0000-0000-00000000000a', v.title, v.author, v.pages, v.status, v.finished_on
from seed_log_dates d,
lateral (values
  ('e0000000-0000-0000-0000-0000000000b1'::uuid, 'Dune', 'Frank Herbert', 412, 'reading', null::date),
  ('e0000000-0000-0000-0000-0000000000b2'::uuid, 'El nombre del viento', 'Patrick Rothfuss', 662, 'finished', d.m1 + 17),
  ('e0000000-0000-0000-0000-0000000000b3'::uuid, 'Rayuela', 'Julio Cortázar', 600, 'finished', d.m2 + 17)
) as v (id, title, author, pages, status, finished_on)
where exists (select 1 from public.profiles p where p.id = 'a0000000-0000-0000-0000-00000000000a')
on conflict (id) do nothing;

-- Leer: check-ins on m1/m2 + 3, + 10, + 17 (the challenge weeks are already covered or earlier).
insert into public.checkins (habit_id, user_id, local_date)
select 'b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', m + n
from seed_log_dates d, unnest(array[d.m1, d.m2]) as m, unnest(array[3, 10, 17]) as n
where exists (select 1 from public.habits h where h.id = 'b0000000-0000-0000-0000-00000000000a')
on conflict (habit_id, local_date) do nothing;
insert into public.checkins (habit_id, user_id, local_date)
select 'b0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', d.today
from seed_log_dates d
where exists (select 1 from public.habits h where h.id = 'b0000000-0000-0000-0000-00000000000a')
on conflict (habit_id, local_date) do nothing;

-- Readings: El nombre del viento in m1 (62 pages, finishing it), Rayuela in m2 (60 pages),
-- Dune 14 -> 40 today. Dune has no readings before today.
insert into public.reading_entries (user_id, habit_id, checkin_id, book_id, local_date, from_page, to_page)
select c.user_id, c.habit_id, c.id, v.book_id, c.local_date, v.from_page, v.to_page
from seed_log_dates d,
lateral (values
  (d.m1 + 3, 'e0000000-0000-0000-0000-0000000000b2'::uuid, 600, 620),
  (d.m1 + 10, 'e0000000-0000-0000-0000-0000000000b2'::uuid, 620, 640),
  (d.m1 + 17, 'e0000000-0000-0000-0000-0000000000b2'::uuid, 640, 662),
  (d.m2 + 3, 'e0000000-0000-0000-0000-0000000000b3'::uuid, 540, 560),
  (d.m2 + 10, 'e0000000-0000-0000-0000-0000000000b3'::uuid, 560, 580),
  (d.m2 + 17, 'e0000000-0000-0000-0000-0000000000b3'::uuid, 580, 600),
  (d.today, 'e0000000-0000-0000-0000-0000000000b1'::uuid, 14, 40)
) as v (local_date, book_id, from_page, to_page)
join public.checkins c
  on c.habit_id = 'b0000000-0000-0000-0000-00000000000a' and c.local_date = v.local_date
join public.books b on b.id = v.book_id
on conflict (checkin_id) do nothing;

-- Gimnasio: photo check-ins (path shape {user}/{checkin}.jpg, objects not seeded) on m2 + 3,
-- m1 + 3, m1 + 10 and today, with deterministic ids so the path can be computed.
-- created_at is the day itself (noon, Santiago) for past days, so the 24 h rejection window of
-- a rival does not apply to old check-ins; today's is created now.
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at)
select md5('seed-gym-' || x.local_date)::uuid, 'b0000000-0000-0000-0000-0000000000a2',
       'a0000000-0000-0000-0000-00000000000a', x.local_date,
       'a0000000-0000-0000-0000-00000000000a/' || md5('seed-gym-' || x.local_date)::uuid || '.jpg',
       case when x.local_date < d.today
            then (x.local_date + time '12:00') at time zone 'America/Santiago'
            else now() end
from seed_log_dates d, unnest(array[d.m2 + 3, d.m1 + 3, d.m1 + 10, d.today]) as x (local_date)
where exists (select 1 from public.habits h where h.id = 'b0000000-0000-0000-0000-0000000000a2')
on conflict do nothing;

-- Same correction for seeded rows created by an earlier run of this block (idempotent: only
-- the seeded gym check-ins of past days whose created_at is not already their own day).
update public.checkins c
set created_at = (c.local_date + time '12:00') at time zone 'America/Santiago'
from seed_log_dates d
where c.habit_id = 'b0000000-0000-0000-0000-0000000000a2'
  and c.id = md5('seed-gym-' || c.local_date)::uuid
  and c.local_date < d.today
  and c.created_at <> (c.local_date + time '12:00') at time zone 'America/Santiago';

-- Workouts (['legs']) on those check-ins, whatever their id.
insert into public.workout_sessions (user_id, habit_id, checkin_id, local_date, day_types)
select c.user_id, c.habit_id, c.id, c.local_date, array['legs']
from seed_log_dates d
join public.checkins c
  on c.habit_id = 'b0000000-0000-0000-0000-0000000000a2'
 and c.local_date in (d.m2 + 3, d.m1 + 3, d.m1 + 10, d.today)
on conflict (checkin_id) do nothing;

-- Sets, only into sessions that have none yet (m2: 55/90; m1: 60/100 and RDL 50; today:
-- Sentadilla 75/80, Prensa 120, Extensión 30).
insert into public.workout_sets (session_id, user_id, local_date, exercise_id, position, reps, weight_kg)
select s.id, s.user_id, s.local_date, x.id, v.position, v.reps, v.kg
from seed_log_dates d,
lateral (values
  (d.m2 + 3, 0, 'squat', 8, 55.0),
  (d.m2 + 3, 1, 'leg_press', 10, 90.0),
  (d.m1 + 3, 0, 'squat', 8, 55.0),
  (d.m1 + 3, 1, 'squat', 8, 60.0),
  (d.m1 + 3, 2, 'leg_press', 10, 100.0),
  (d.m1 + 10, 0, 'romanian_deadlift', 10, 50.0),
  (d.today, 0, 'squat', 5, 75.0),
  (d.today, 1, 'squat', 5, 80.0),
  (d.today, 2, 'leg_press', 10, 120.0),
  (d.today, 3, 'leg_extension', 12, 30.0)
) as v (local_date, position, key, reps, kg)
join public.workout_sessions s
  on s.habit_id = 'b0000000-0000-0000-0000-0000000000a2' and s.local_date = v.local_date
join public.exercises x on x.key = v.key
where not exists (select 1 from public.workout_sets w where w.session_id = s.id);

-- Private body weights (9 across the last three months, 71,9 kg today) and the height.
insert into public.body_weights (user_id, measured_on, weight_kg)
select 'a0000000-0000-0000-0000-00000000000a', v.measured_on, v.kg
from seed_log_dates d,
lateral (values
  (d.m2 + 2, 74.0), (d.m2 + 12, 73.6), (d.m2 + 24, 73.3),
  (d.m1 + 2, 72.9), (d.m1 + 12, 72.6), (d.m1 + 25, 72.4),
  (d.today - 14, 72.3), (d.today - 7, 72.1), (d.today, 71.9)
) as v (measured_on, kg)
where exists (select 1 from public.profiles p where p.id = 'a0000000-0000-0000-0000-00000000000a')
on conflict (user_id, measured_on) do nothing;

update public.profiles set height_cm = 168
where id = 'a0000000-0000-0000-0000-00000000000a' and height_cm is null;

drop table seed_log_dates;
