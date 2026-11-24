-- Streak-at-risk and weekly-summary pushes.
--  1. profiles.notify_streak_risk / notify_weekly_summary (default true, owner can flip them
--     from Ajustes): the opt-outs of the two new notifications.
--  2. notification_log: once per user, kind and local date. The reminders cron inserts here first
--     (ON CONFLICT DO NOTHING) and only sends when the insert won, like reminder_log does for the
--     daily reminder. A separate table (not a new reminder_log kind) so the running app keeps
--     working while this migration is applied before the new code is deployed.
--  3. checkin_dates is granted to service_role: the cron reads streak history through it (it was
--     authenticated-only, so the cron would hit 42501).
--  4. notification_targets(kind): live users with a push subscription who did not opt out, for the
--     cron to filter by local time in code.
-- Idempotent: safe to run twice.

alter table public.profiles add column if not exists notify_streak_risk boolean not null default true;
alter table public.profiles add column if not exists notify_weekly_summary boolean not null default true;
grant update (notify_streak_risk, notify_weekly_summary) on public.profiles to authenticated;

create table if not exists public.notification_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('streak_risk', 'weekly_summary')),
  local_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, local_date)
);
alter table public.notification_log enable row level security; -- no policies: service role only
revoke all on public.notification_log from anon, authenticated;

create or replace function public.notification_targets(p_kind text)
returns table (user_id uuid, timezone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.timezone
  from public.profiles p
  where p.deleted_at is null
    and (
      (p_kind = 'streak_risk' and p.notify_streak_risk)
      or (p_kind = 'weekly_summary' and p.notify_weekly_summary)
    )
    and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
  order by p.id;
$$;
revoke execute on function public.notification_targets(text) from public, anon, authenticated;
grant execute on function public.notification_targets(text) to service_role;

-- The cron (service role) reads check-in dates with checkin_dates; it was granted to authenticated only.
grant execute on function public.checkin_dates(uuid[], date) to service_role;
