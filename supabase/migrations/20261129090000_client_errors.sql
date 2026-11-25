-- Self-hosted error monitoring: client_errors, one row per (fingerprint, hour) with a counter.
--  * Written ONLY by POST /api/client-errors as service_role, through record_client_error() (an upsert that increments
--    `count`; PostgREST cannot express "count = count + 1"). RLS is on with NO client policies: nobody else reads it.
--  * `bucket` is the hour of first sighting; the unique key (fingerprint, bucket) is the dedup. Expression-free on purpose:
--    date_trunc on timestamptz is only STABLE, so it cannot be an index expression.
--  * purge_client_errors() deletes rows older than 30 days; the reminders cron calls it (cheap: indexed range delete).
-- service_role is granted explicitly. Idempotent: safe to run twice.
begin;

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  bucket timestamptz not null default pg_catalog.date_trunc('hour', now()),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('error', 'unhandledrejection', 'react', 'server')),
  message text not null check (char_length(message) <= 1000),
  stack text check (stack is null or char_length(stack) <= 4000),
  url_path text not null default '/' check (char_length(url_path) <= 200 and url_path not like '%?%' and url_path like '/%'),
  ua_kind text not null check (ua_kind in ('native', 'browser')),
  app_version text check (app_version is null or char_length(app_version) <= 20),
  release text check (release is null or char_length(release) <= 40),
  fingerprint text not null check (char_length(fingerprint) between 8 and 64),
  count integer not null default 1 check (count >= 1)
);
create unique index if not exists client_errors_fingerprint_bucket_key on public.client_errors (fingerprint, bucket);
create index if not exists client_errors_created_idx on public.client_errors (created_at);
create index if not exists client_errors_last_seen_idx on public.client_errors (last_seen_at desc);
create index if not exists client_errors_user_idx on public.client_errors (user_id) where user_id is not null;

alter table public.client_errors enable row level security; -- no policies: service role only
revoke all on public.client_errors from public, anon, authenticated;
grant select, insert, update, delete on public.client_errors to service_role;

-- The upsert. Inputs are capped again here, so a caller that skips the API's sanitizing still cannot store a blob.
create or replace function public.record_client_error(
  p_user_id uuid, p_kind text, p_message text, p_stack text, p_url_path text,
  p_ua_kind text, p_app_version text, p_release text, p_fingerprint text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
begin
  insert into public.client_errors as e
    (user_id, kind, message, stack, url_path, ua_kind, app_version, release, fingerprint, bucket)
  values (
    p_user_id, p_kind, pg_catalog.left(p_message, 1000), pg_catalog.left(p_stack, 4000),
    pg_catalog.left(pg_catalog.split_part(coalesce(nullif(p_url_path, ''), '/'), '?', 1), 200),
    p_ua_kind, pg_catalog.left(p_app_version, 20), pg_catalog.left(p_release, 40), p_fingerprint, v_bucket
  )
  on conflict (fingerprint, bucket) do update
    set count = e.count + 1,
        last_seen_at = pg_catalog.now(),
        user_id = coalesce(e.user_id, excluded.user_id);
end;
$$;
revoke execute on function public.record_client_error(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_client_error(uuid, text, text, text, text, text, text, text, text) to service_role;

-- Retention: 30 days, by first sighting. Returns how many rows went.
create or replace function public.purge_client_errors()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.client_errors e where e.created_at < pg_catalog.now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.purge_client_errors() from public, anon, authenticated;
grant execute on function public.purge_client_errors() to service_role;

commit;
