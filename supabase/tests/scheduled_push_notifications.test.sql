begin;
-- supabase/seed.sql loads local test users; these tests build their own fixtures inside
-- this transaction, so clear the seed first (rolled back at the end).
truncate public.profiles cascade;
delete from auth.users where email like '%@example.com';
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Fixtures:
--   01 pushy    push subscription, both notifications on (defaults)
--   02 nostreak push subscription, notify_streak_risk = false
--   03 nosumm   push subscription, notify_weekly_summary = false
--   04 nopush   no push subscription
--   05 gone     push subscription but deleted
insert into auth.users (id)
select ('e0000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 5) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at, notify_streak_risk, notify_weekly_summary) values
  ('e0000000-0000-0000-0000-000000000001', 'pushy',    'P', 'One',   '1990-01-01', now(), 'America/Santiago', null, true,  true),
  ('e0000000-0000-0000-0000-000000000002', 'nostreak', 'N', 'Two',   '1990-01-01', now(), 'Europe/Madrid',    null, false, true),
  ('e0000000-0000-0000-0000-000000000003', 'nosumm',   'N', 'Three', '1990-01-01', now(), 'Asia/Tokyo',       null, true,  false),
  ('e0000000-0000-0000-0000-000000000004', 'nopush',   'N', 'Four',  '1990-01-01', now(), 'America/Santiago', null, true,  true),
  ('e0000000-0000-0000-0000-000000000005', 'gone_g',   'G', 'Five',  '1990-01-01', now(), 'America/Santiago', now(), true,  true);
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('e0000000-0000-0000-0000-000000000001', 'https://fcm.googleapis.com/fcm/send/e1', 'k', 'a'),
  ('e0000000-0000-0000-0000-000000000002', 'https://fcm.googleapis.com/fcm/send/e2', 'k', 'a'),
  ('e0000000-0000-0000-0000-000000000003', 'https://fcm.googleapis.com/fcm/send/e3', 'k', 'a'),
  ('e0000000-0000-0000-0000-000000000005', 'https://fcm.googleapis.com/fcm/send/e5', 'k', 'a');

-- ============================================================ columns
select has_column('public', 'profiles', 'notify_streak_risk', 'profiles.notify_streak_risk exists');
select has_column('public', 'profiles', 'notify_weekly_summary', 'profiles.notify_weekly_summary exists');
select col_default_is('public', 'profiles', 'notify_streak_risk', 'true', 'streak risk defaults to on');
select col_default_is('public', 'profiles', 'notify_weekly_summary', 'true', 'weekly summary defaults to on');
select ok(has_column_privilege('authenticated', 'public.profiles', 'notify_streak_risk', 'UPDATE'), 'owner can flip notify_streak_risk');
select ok(has_column_privilege('authenticated', 'public.profiles', 'notify_weekly_summary', 'UPDATE'), 'owner can flip notify_weekly_summary');

-- the owner flips it through RLS
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.profiles set notify_weekly_summary = false where id = 'e0000000-0000-0000-0000-000000000001';
select is((select notify_weekly_summary from public.profiles where id = 'e0000000-0000-0000-0000-000000000001'), false, 'the owner turned the weekly summary off');
update public.profiles set notify_weekly_summary = true where id = 'e0000000-0000-0000-0000-000000000001';
reset role;

-- ============================================================ notification_targets
select ok(not has_function_privilege('authenticated', 'public.notification_targets(text)', 'execute'), 'clients cannot list notification targets');
select ok(not has_function_privilege('anon', 'public.notification_targets(text)', 'execute'), 'anon cannot list notification targets');
select ok(has_function_privilege('service_role', 'public.notification_targets(text)', 'execute'), 'the service role can');
select is((select array_agg(user_id order by user_id) from public.notification_targets('streak_risk')),
  array['e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003']::uuid[],
  'streak_risk: push subscribers who did not opt out, live only');
select is((select array_agg(user_id order by user_id) from public.notification_targets('weekly_summary')),
  array['e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002']::uuid[],
  'weekly_summary: push subscribers who did not opt out, live only');
select is((select count(*)::int from public.notification_targets('nonsense')), 0, 'an unknown kind lists nobody');
select is((select timezone from public.notification_targets('streak_risk') where user_id = 'e0000000-0000-0000-0000-000000000003'), 'Asia/Tokyo',
  'the timezone comes with the target');

-- ============================================================ notification_log
select ok(not has_table_privilege('authenticated', 'public.notification_log', 'SELECT'), 'clients cannot read the log');
select ok(not has_table_privilege('authenticated', 'public.notification_log', 'INSERT'), 'clients cannot write the log');
insert into public.notification_log (user_id, kind, local_date) values ('e0000000-0000-0000-0000-000000000001', 'streak_risk', '2026-11-22');
select lives_ok($$ insert into public.notification_log (user_id, kind, local_date) values ('e0000000-0000-0000-0000-000000000001', 'weekly_summary', '2026-11-22') $$,
  'the same user and day can hold both kinds');
select lives_ok($$ insert into public.notification_log (user_id, kind, local_date) values ('e0000000-0000-0000-0000-000000000001', 'streak_risk', '2026-11-23') $$,
  'the next day is a new slot');
select throws_ok($$ insert into public.notification_log (user_id, kind, local_date) values ('e0000000-0000-0000-0000-000000000001', 'streak_risk', '2026-11-22') $$,
  '23505', null, 'a second streak_risk for the same user and day is refused');
select throws_ok($$ insert into public.notification_log (user_id, kind, local_date) values ('e0000000-0000-0000-0000-000000000001', 'bogus', '2026-11-22') $$,
  '23514', null, 'an unknown kind is refused');
with lost as (
  insert into public.notification_log (user_id, kind, local_date) values ('e0000000-0000-0000-0000-000000000001', 'streak_risk', '2026-11-22')
  on conflict (user_id, kind, local_date) do nothing returning 1
)
select is((select count(*)::int from lost), 0, 'the cron upsert (do nothing) loses the claim the second time');

-- ============================================================ the cron path runs as service_role
-- every call scheduled-data-repo / the targets / log repos make, with the privileges the cron really has
select ok(has_function_privilege('service_role', 'public.checkin_dates(uuid[],date)', 'execute'), 'service_role can run checkin_dates (the cron reads streak history with it)');
set local role service_role;
select lives_ok($$ select * from public.checkin_dates(array['e0000000-0000-0000-0000-0000000000aa']::uuid[], '2026-01-01') $$, 'service_role: checkin_dates');
select lives_ok($$ select user_id, timezone from public.notification_targets('streak_risk') order by user_id limit 10 $$, 'service_role: notification_targets');
select lives_ok($$ select id, user_id, name, visibility, archived_at, created_at, frequency_type, target_per_week from public.habits
  where user_id in ('e0000000-0000-0000-0000-000000000001') and archived_at is null order by id limit 10 $$, 'service_role: habits read');
select lives_ok($$ select id, debtor_id, creditor_id, challenge_id, period_start, amount, paid_at, created_at from public.debts
  where debtor_id in ('e0000000-0000-0000-0000-000000000001') or creditor_id in ('e0000000-0000-0000-0000-000000000001') order by id limit 10 $$, 'service_role: debts read');
select lives_ok($$ insert into public.notification_log (user_id, kind, local_date) values ('e0000000-0000-0000-0000-000000000001', 'weekly_summary', '2026-12-06')
  on conflict (user_id, kind, local_date) do nothing $$, 'service_role: notification_log claim');
reset role;
select is((select count(*)::int from public.notification_log where local_date = '2026-12-06'), 1, 'the claim written as service_role is stored');

select * from finish();
rollback;
