-- Native push (Expo): one row per installed device, and the tickets whose receipts the cron checks.
--  1. device_push_tokens: written ONLY by the /api/m/push-token route as service_role (a token that moves to another
--     account is an upsert on `token`, which an owner could not do under RLS). The owner can read and delete own rows.
--  2. expo_push_tickets: service role only. sendPush saves the ticket ids; the reminders cron reads the receipts
--     15 minutes later, deletes the token on DeviceNotRegistered and drops the ticket.
--  3. notification_targets also counts a device token as a push channel, so the streak and weekly pushes reach
--     users who only have the native app.
-- service_role is granted explicitly: a missing grant fails silently in production with 42501.
-- Idempotent: safe to run twice.
begin;

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  platform text not null default 'android' check (platform in ('android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists device_push_tokens_user_idx on public.device_push_tokens (user_id);
alter table public.device_push_tokens enable row level security;

drop policy if exists dpt_select_own on public.device_push_tokens;
create policy dpt_select_own on public.device_push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists dpt_delete_own on public.device_push_tokens;
create policy dpt_delete_own on public.device_push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.device_push_tokens from public, anon, authenticated;
grant select, delete on public.device_push_tokens to authenticated;
grant select, insert, update, delete on public.device_push_tokens to service_role;

create table if not exists public.expo_push_tickets (
  ticket_id text primary key,
  token text not null,
  created_at timestamptz not null default now()
);
create index if not exists expo_push_tickets_created_idx on public.expo_push_tickets (created_at);
alter table public.expo_push_tickets enable row level security; -- no policies: service role only
revoke all on public.expo_push_tickets from public, anon, authenticated;
grant select, insert, update, delete on public.expo_push_tickets to service_role;

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
    and (
      exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
      or exists (select 1 from public.device_push_tokens d where d.user_id = p.id)
    )
  order by p.id;
$$;
revoke execute on function public.notification_targets(text) from public, anon, authenticated;
grant execute on function public.notification_targets(text) to service_role;

commit;
