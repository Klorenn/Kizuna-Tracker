-- Day-15 in-app notice. Not a lock-screen push: the row is inserted with pushed_at already set.
-- No new notify_* column. One log row per user per local day.

do $$
declare
  cname text;
begin
  select c.conname into cname
  from pg_constraint c
  where c.conrelid = 'public.notification_log'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%kind%';
  if cname is not null then
    execute format('alter table public.notification_log drop constraint %I', cname);
  end if;
end $$;

alter table public.notification_log
  add constraint notification_log_kind_check
  check (kind in ('streak_risk', 'weekly_summary', 'outing_month_nudge'));
