-- Android widget: device tokens, one-time pairing codes, service-role check-in. Idempotent, one transaction.
-- Apply BEFORE deploying /api/widget.
begin;

create table if not exists public.widget_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Android' check (char_length(label) between 1 and 40),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists widget_tokens_user_live_idx on public.widget_tokens (user_id) where revoked_at is null;
alter table public.widget_tokens enable row level security;
revoke all on public.widget_tokens from public, anon, authenticated;
grant select (id, user_id, label, created_at, last_used_at, revoked_at) on public.widget_tokens to authenticated; -- never token_hash
drop policy if exists widget_tokens_select_own on public.widget_tokens;
create policy widget_tokens_select_own on public.widget_tokens
  for select to authenticated using (user_id = (select auth.uid()) and revoked_at is null);

create table if not exists public.widget_pairing_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists widget_pairing_codes_user_idx on public.widget_pairing_codes (user_id);
alter table public.widget_pairing_codes enable row level security; -- no policies: definer functions only
revoke all on public.widget_pairing_codes from public, anon, authenticated;

-- Shared body: 0018's create_checkin with v_uid := p_user_id. No grants (owner only).
create or replace function public.create_checkin_as(p_user_id uuid, p_habit_id uuid)
returns table (checkin_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_requires_photo boolean;
  v_log_type text;
  v_date date;
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.timezone into v_tz from public.profiles p
  where p.id = p_user_id and p.deleted_at is null;
  if not found then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select h.requires_photo, h.log_type into v_requires_photo, v_log_type
  from public.habits h
  where h.id = p_habit_id and h.user_id = p_user_id and h.archived_at is null;
  if not found then
    raise exception 'habit_not_found';
  end if;
  if v_log_type = 'quantity' then
    raise exception 'quantity_habit';
  end if;
  if exists (
    select 1 from public.habit_items i
    where i.habit_id = p_habit_id and i.archived_at is null
  ) then
    raise exception 'habit_has_items';
  end if;
  if v_requires_photo then
    raise exception 'photo_required';
  end if;

  v_date := (now() at time zone v_tz)::date;

  insert into public.checkins as c (habit_id, user_id, local_date)
  values (p_habit_id, p_user_id, v_date)
  on conflict (habit_id, local_date) do nothing
  returning c.id into v_id;

  if v_id is not null then
    return query select v_id, true;
  else
    return query
      select c.id, false from public.checkins c
      where c.habit_id = p_habit_id and c.local_date = v_date;
  end if;
end;
$$;
revoke execute on function public.create_checkin_as(uuid, uuid) from public, anon, authenticated, service_role;

-- Same signature, return type, grants and errors as 0018; the body now lives in create_checkin_as.
create or replace function public.create_checkin(p_habit_id uuid)
returns table (checkin_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from public.create_checkin_as((select auth.uid()), p_habit_id);
end;
$$;
grant execute on function public.create_checkin(uuid) to authenticated;

create or replace function public.widget_create_checkin(p_user_id uuid, p_habit_id uuid)
returns table (checkin_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_type text;
begin
  select h.log_type into v_log_type from public.habits h
  where h.id = p_habit_id and h.user_id = p_user_id and h.archived_at is null;
  -- quantity is left to the shared body so it fails with the same quantity_habit the web gets
  if found and coalesce(v_log_type, 'none') not in ('none', 'quantity') then
    raise exception 'widget_unsupported';
  end if;
  -- every other guard and error lives in the shared body
  return query select * from public.create_checkin_as(p_user_id, p_habit_id);
end;
$$;
revoke execute on function public.widget_create_checkin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.widget_create_checkin(uuid, uuid) to service_role;

-- Web (Ajustes): one live code per user, 5 minutes. Key wpair:new:<uid> 10/h.
create or replace function public.create_widget_pairing_code()
returns table (code text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := public.groups_random_invite_code();
  v_exp timestamptz := now() + interval '5 minutes';
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.rate_limit('wpair:new:' || v_uid::text, 10, 3600, true) then
    raise exception 'rate_limited';
  end if;
  delete from public.widget_pairing_codes c where c.user_id = v_uid and c.used_at is null;
  delete from public.widget_pairing_codes c where c.expires_at < now() - interval '1 day';
  insert into public.widget_pairing_codes (code_hash, user_id, expires_at)
  values (pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_code, 'UTF8')), 'hex'), v_uid, v_exp);
  return query select v_code, v_exp;
end;
$$;
revoke execute on function public.create_widget_pairing_code() from public, anon;
grant execute on function public.create_widget_pairing_code() to authenticated;

-- Device: code -> token. Wrong guesses are counted on p_ip_key (10/900s). Null key = no limiter (local dev).
create or replace function public.widget_pair(p_code text, p_token_hash text, p_label text, p_previous_token_hash text, p_ip_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_uid uuid;
  v_n int;
  v_id uuid;
  v_username text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token_hash';
  end if;
  if p_ip_key is not null and public.rate_limit(p_ip_key, 10, 900, false) then
    return jsonb_build_object('status', 'limited');
  end if;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(public.groups_normalize_code(p_code), ''), 'UTF8')), 'hex');
  select c.user_id into v_uid from public.widget_pairing_codes c
  join public.profiles p on p.id = c.user_id and p.deleted_at is null
  where c.code_hash = v_hash and c.used_at is null and c.expires_at > now()
  for update of c;
  if not found then
    if p_ip_key is not null then
      perform public.rate_limit(p_ip_key, 10, 900, true);
    end if;
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('widget_tokens:' || v_uid::text, 0));
  select pg_catalog.count(*)::int into v_n from public.widget_tokens t
  where t.user_id = v_uid and t.revoked_at is null and t.token_hash is distinct from p_previous_token_hash;
  if v_n >= 3 then
    return jsonb_build_object('status', 'limit_reached'); -- the code stays usable
  end if;
  update public.widget_tokens t set revoked_at = now()
  where t.user_id = v_uid and t.token_hash = p_previous_token_hash and t.revoked_at is null;
  update public.widget_pairing_codes c set used_at = now() where c.code_hash = v_hash;
  insert into public.widget_tokens (user_id, token_hash, label)
  values (v_uid, p_token_hash, left(coalesce(nullif(btrim(p_label), ''), 'Android'), 40))
  returning id into v_id;
  select p.username into v_username from public.profiles p where p.id = v_uid;
  return jsonb_build_object('status', 'ok', 'token_id', v_id, 'username', v_username);
end;
$$;
revoke execute on function public.widget_pair(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.widget_pair(text, text, text, text, text) to service_role;

-- Bearer -> user. IP failure bucket 30/900s. Per token: today 120/3600s, checkin 60/600s. last_used_at is written at most every 10 min.
create or replace function public.widget_auth(p_token_hash text, p_ip_key text, p_scope text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_uid uuid;
  v_tz text;
  v_last timestamptz;
begin
  if p_scope not in ('today', 'checkin') then
    raise exception 'invalid_scope';
  end if;
  -- Look the token up FIRST: a live token (256 random bits, not guessable) never touches the address bucket, so
  -- bogus tokens from a shared NAT / IPv6 /64 cannot lock out the valid widgets behind the same address.
  select t.id, t.user_id, p.timezone, t.last_used_at into v_id, v_uid, v_tz, v_last
  from public.widget_tokens t
  join public.profiles p on p.id = t.user_id and p.deleted_at is null
  where t.token_hash = p_token_hash and t.revoked_at is null;
  if not found then
    -- Only the failure path is counted against the address (and throttled by it).
    if p_ip_key is not null and public.rate_limit(p_ip_key, 30, 900, false) then
      return jsonb_build_object('status', 'limited');
    end if;
    if p_ip_key is not null then
      perform public.rate_limit(p_ip_key, 30, 900, true);
    end if;
    return jsonb_build_object('status', 'invalid');
  end if;
  if public.rate_limit('wtok:' || p_scope || ':' || v_id::text,
       case p_scope when 'today' then 120 else 60 end,
       case p_scope when 'today' then 3600 else 600 end, true) then
    return jsonb_build_object('status', 'limited');
  end if;
  if v_last is null or v_last < now() - interval '10 minutes' then
    update public.widget_tokens t set last_used_at = now() where t.id = v_id;
  end if;
  return jsonb_build_object('status', 'ok', 'token_id', v_id, 'user_id', v_uid, 'time_zone', v_tz);
end;
$$;
revoke execute on function public.widget_auth(text, text, text) from public, anon, authenticated;
grant execute on function public.widget_auth(text, text, text) to service_role;

create or replace function public.revoke_widget_token(p_token_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  update public.widget_tokens t set revoked_at = now()
  where t.id = p_token_id and t.user_id = v_uid and t.revoked_at is null;
  return found;
end;
$$;
revoke execute on function public.revoke_widget_token(uuid) from public, anon;
grant execute on function public.revoke_widget_token(uuid) to authenticated;

commit;
