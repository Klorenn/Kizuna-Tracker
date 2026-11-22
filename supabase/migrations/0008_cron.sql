-- Scheduled jobs: every 15 minutes the database calls the app's cron endpoints
-- (close finished challenge periods into debts, send reminders).
--
-- The app URL and the bearer secret live in Supabase Vault, never in this file.
-- Set them once per environment (SQL editor, as postgres):
--   select vault.create_secret('https://your-app.example.com', 'app_url');
--   select vault.create_secret('<same value as CRON_SECRET in the app env>', 'cron_secret');
-- To rotate: select vault.update_secret(id, 'new value') from vault.secrets where name = 'cron_secret';
--
-- Until both secrets exist the job is a silent no-op, so `supabase db reset` and local
-- development work without them.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end;
$$;

create or replace function public.call_cron_endpoints()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_path text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;
  v_url := regexp_replace(v_url, '/+$', '');
  foreach v_path in array array['/api/cron/close-periods', '/api/cron/reminders'] loop
    perform net.http_post(
      url := v_url || v_path,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  end loop;
end;
$$;

revoke execute on function public.call_cron_endpoints() from public, anon, authenticated;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kizuna-cron';
    perform cron.schedule('kizuna-cron', '*/15 * * * *', 'select public.call_cron_endpoints()');
  end if;
end;
$$;
