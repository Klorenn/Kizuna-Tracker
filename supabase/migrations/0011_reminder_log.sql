-- One daily reminder per user per local date. The cron inserts here first (ON CONFLICT DO NOTHING)
-- and only sends when the insert won, so overlapping or retried runs never double-send.
create table public.reminder_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
alter table public.reminder_log enable row level security; -- no policies: service role only
revoke all on public.reminder_log from anon, authenticated;
