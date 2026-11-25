-- client_errors hardening (follow-up to 20261129090000, which is already applied and must not be edited):
--  * stored stack capped at 2000 chars (was 4000);
--  * a global write cap: when the current hour already holds 200 distinct rows (fingerprints), a NEW fingerprint is
--    dropped; an existing one still increments `count`. The count uses client_errors_bucket_idx (bucket = v_bucket).
--    Two concurrent first-sightings can overshoot 200 by a few rows: a soft cap, which is enough to bound the table.
-- Idempotent: safe to run twice.
begin;

create index if not exists client_errors_bucket_idx on public.client_errors (bucket);

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
  v_rows integer;
begin
  -- known fingerprint this hour: just count it (uses the (fingerprint, bucket) unique index)
  update public.client_errors e
     set count = e.count + 1,
         last_seen_at = pg_catalog.now(),
         user_id = coalesce(e.user_id, p_user_id)
   where e.fingerprint = p_fingerprint and e.bucket = v_bucket;
  if found then
    return;
  end if;

  -- new fingerprint: refuse it once the hour is full
  select pg_catalog.count(*)::integer into v_rows from public.client_errors e where e.bucket = v_bucket;
  if v_rows >= 200 then
    return;
  end if;

  insert into public.client_errors as e
    (user_id, kind, message, stack, url_path, ua_kind, app_version, release, fingerprint, bucket)
  values (
    p_user_id, p_kind, pg_catalog.left(p_message, 1000), pg_catalog.left(p_stack, 2000),
    pg_catalog.left(pg_catalog.split_part(coalesce(nullif(p_url_path, ''), '/'), '?', 1), 200),
    p_ua_kind, pg_catalog.left(p_app_version, 20), pg_catalog.left(p_release, 40), p_fingerprint, v_bucket
  )
  on conflict (fingerprint, bucket) do update -- lost a race with the same fingerprint
    set count = e.count + 1,
        last_seen_at = pg_catalog.now(),
        user_id = coalesce(e.user_id, excluded.user_id);
end;
$$;
revoke execute on function public.record_client_error(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_client_error(uuid, text, text, text, text, text, text, text, text) to service_role;

commit;
