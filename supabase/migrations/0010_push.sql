-- Web push fan-out bookkeeping. A notification is "pushed" once; whoever claims the row first
-- (the app's notify() or the reminders cron sweeping SQL-inserted rows such as photo_rejected)
-- stamps pushed_at, so a push is never sent twice.
alter table public.notifications add column pushed_at timestamptz;

-- Rows that exist today were never meant to be pushed retroactively.
update public.notifications set pushed_at = now() where pushed_at is null;

create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;
