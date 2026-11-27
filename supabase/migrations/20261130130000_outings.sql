-- Outings are not groups. The client never reads or writes this table.
-- Estas tablas no son Grupos. El cliente no las toca.

create table public.outings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  place_name text not null,
  place_detail text,
  place_key text not null,
  lat double precision not null,
  lng double precision not null,
  month_start date not null,
  starts_on date not null,
  ends_on date not null,
  note text,
  status text not null,
  went_on date,
  created_at timestamptz not null default now(),
  constraint outings_place_name_len check (char_length(place_name) between 1 and 80),
  constraint outings_place_detail_len check (place_detail is null or char_length(place_detail) between 1 and 120),
  constraint outings_note_len check (note is null or char_length(note) between 1 and 280),
  constraint outings_place_key_shape check (
    place_key ~ '^(nominatim:(node|way|relation):[0-9]{1,20}|coord:-?[0-9]{1,3}[.][0-9]{5}:-?[0-9]{1,3}[.][0-9]{5})$'
  ),
  constraint outings_lat_range check (lat >= -90 and lat <= 90),
  constraint outings_lng_range check (lng >= -180 and lng <= 180),
  constraint outings_dates_in_month check (
    starts_on >= month_start
    and ends_on >= starts_on
    and ends_on < (month_start + interval '1 month')::date
  ),
  constraint outings_status check (status in ('planned', 'went')),
  constraint outings_went_iff check ((status = 'went') = (went_on is not null))
);

create index outings_owner_month_idx on public.outings (owner_id, month_start);

alter table public.outings enable row level security;

revoke all on public.outings from public, anon, authenticated;

create trigger outings_forbid_deleted_actor
  before insert or update or delete on public.outings
  for each statement execute function public.forbid_deleted_actor();

-- Caller, local day, and the civil month of profiles.timezone. Deleted accounts are not_authenticated.
create function public.outings_self()
returns table (uid uuid, today date, month_start date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tz text;
begin
  if v_uid is null
     or not exists (
       select 1 from public.profiles p
       where p.id = v_uid and p.deleted_at is null
     ) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select p.timezone into v_tz from public.profiles p where p.id = v_uid;
  return query
  select
    v_uid,
    (pg_catalog.now() at time zone v_tz)::date,
    pg_catalog.date_trunc('month', (pg_catalog.now() at time zone v_tz)::timestamp)::date;
end;
$$;

create function public.outings_clean(
  p_place_name text,
  p_place_detail text,
  p_place_key text,
  p_lat double precision,
  p_lng double precision,
  p_starts_on date,
  p_ends_on date,
  p_note text,
  p_month date
)
returns table (
  place_name text,
  place_detail text,
  place_key text,
  lat double precision,
  lng double precision,
  starts_on date,
  ends_on date,
  note text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := nullif(pg_catalog.btrim(p_place_name), '');
  v_detail text := nullif(pg_catalog.btrim(p_place_detail), '');
  v_note text := nullif(pg_catalog.btrim(p_note), '');
begin
  if v_name is null or pg_catalog.char_length(v_name) > 80
     or (v_detail is not null and pg_catalog.char_length(v_detail) > 120)
     or p_place_key is null
     or p_place_key !~ '^(nominatim:(node|way|relation):[0-9]{1,20}|coord:-?[0-9]{1,3}[.][0-9]{5}:-?[0-9]{1,3}[.][0-9]{5})$'
     or p_lat is null or p_lng is null
     or p_lat <> p_lat or p_lng <> p_lng
     or p_lat < -90 or p_lat > 90
     or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid_place';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 280 then
    raise exception 'invalid_note';
  end if;
  if p_starts_on is null or p_ends_on is null
     or p_month is null
     or p_starts_on < p_month
     or p_ends_on < p_starts_on
     or p_ends_on >= (p_month + interval '1 month')::date then
    raise exception 'invalid_dates';
  end if;
  return query
  select v_name, v_detail, p_place_key, p_lat, p_lng, p_starts_on, p_ends_on, v_note;
end;
$$;

create function public.create_outing(
  p_place_name text,
  p_place_detail text,
  p_place_key text,
  p_lat double precision,
  p_lng double precision,
  p_starts_on date,
  p_ends_on date,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_name text;
  v_detail text;
  v_key text;
  v_lat double precision;
  v_lng double precision;
  v_starts date;
  v_ends date;
  v_note text;
  v_id uuid;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select c.place_name, c.place_detail, c.place_key, c.lat, c.lng, c.starts_on, c.ends_on, c.note
    into v_name, v_detail, v_key, v_lat, v_lng, v_starts, v_ends, v_note
  from public.outings_clean(
    p_place_name, p_place_detail, p_place_key, p_lat, p_lng, p_starts_on, p_ends_on, p_note, v_month
  ) c;
  insert into public.outings (
    owner_id, place_name, place_detail, place_key, lat, lng,
    month_start, starts_on, ends_on, note, status
  ) values (
    v_uid, v_name, v_detail, v_key, v_lat, v_lng,
    v_month, v_starts, v_ends, v_note, 'planned'
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_outing(
  p_id uuid,
  p_place_name text,
  p_place_detail text,
  p_place_key text,
  p_lat double precision,
  p_lng double precision,
  p_starts_on date,
  p_ends_on date,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_status text;
  v_row_month date;
  v_name text;
  v_detail text;
  v_key text;
  v_lat double precision;
  v_lng double precision;
  v_starts date;
  v_ends date;
  v_note text;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select o.status, o.month_start into v_status, v_row_month
  from public.outings o
  where o.id = p_id and o.owner_id = v_uid
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status = 'went' then
    raise exception 'outing_closed';
  end if;
  if v_row_month <> v_month then
    raise exception 'month_closed';
  end if;
  select c.place_name, c.place_detail, c.place_key, c.lat, c.lng, c.starts_on, c.ends_on, c.note
    into v_name, v_detail, v_key, v_lat, v_lng, v_starts, v_ends, v_note
  from public.outings_clean(
    p_place_name, p_place_detail, p_place_key, p_lat, p_lng, p_starts_on, p_ends_on, p_note, v_month
  ) c;
  update public.outings set
    place_name = v_name,
    place_detail = v_detail,
    place_key = v_key,
    lat = v_lat,
    lng = v_lng,
    starts_on = v_starts,
    ends_on = v_ends,
    note = v_note
  where id = p_id and owner_id = v_uid and status = 'planned';
end;
$$;

create function public.mark_outing_went(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_status text;
  v_starts date;
  v_row_month date;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select o.status, o.starts_on, o.month_start into v_status, v_starts, v_row_month
  from public.outings o
  where o.id = p_id and o.owner_id = v_uid
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status = 'went' then
    return;
  end if;
  if v_today < v_starts then
    raise exception 'too_early';
  end if;
  if v_today >= (v_row_month + interval '1 month')::date then
    raise exception 'month_closed';
  end if;
  update public.outings
  set status = 'went', went_on = v_today
  where id = p_id and owner_id = v_uid and status = 'planned';
end;
$$;

create function public.cancel_outing(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_status text;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select o.status into v_status
  from public.outings o
  where o.id = p_id and o.owner_id = v_uid
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status = 'went' then
    raise exception 'outing_closed';
  end if;
  delete from public.outings
  where id = p_id and owner_id = v_uid and status = 'planned';
end;
$$;

create function public.my_month()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_completed int;
  v_outings jsonb;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select count(*)::int into v_completed
  from public.outings o
  where o.owner_id = v_uid and o.month_start = v_month and o.status = 'went';
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', o.id,
        'place_name', o.place_name,
        'place_detail', o.place_detail,
        'place_key', o.place_key,
        'lat', o.lat,
        'lng', o.lng,
        'starts_on', o.starts_on,
        'ends_on', o.ends_on,
        'note', o.note,
        'status', o.status,
        'went_on', o.went_on
      )
      order by o.starts_on, o.created_at
    ),
    '[]'::jsonb
  )
  into v_outings
  from public.outings o
  where o.owner_id = v_uid and o.month_start = v_month;
  return pg_catalog.jsonb_build_object(
    'month_start', v_month,
    'completed', v_completed,
    'outings', v_outings
  );
end;
$$;

create function public.my_map()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_pins jsonb;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', o.id,
        'place_name', o.place_name,
        'place_detail', o.place_detail,
        'place_key', o.place_key,
        'lat', o.lat,
        'lng', o.lng,
        'month_start', o.month_start,
        'starts_on', o.starts_on,
        'ends_on', o.ends_on,
        'note', o.note,
        'went_on', o.went_on
      )
      order by o.starts_on, o.created_at
    ),
    '[]'::jsonb
  )
  into v_pins
  from public.outings o
  where o.owner_id = v_uid and o.status = 'went';
  return pg_catalog.jsonb_build_object('pins', v_pins, 'plans', '[]'::jsonb);
end;
$$;

revoke all on function public.outings_self() from public, anon, authenticated;
revoke all on function public.outings_clean(text, text, text, double precision, double precision, date, date, text, date)
  from public, anon, authenticated;

revoke all on function
  public.create_outing(text, text, text, double precision, double precision, date, date, text),
  public.update_outing(uuid, text, text, text, double precision, double precision, date, date, text),
  public.mark_outing_went(uuid),
  public.cancel_outing(uuid),
  public.my_month(),
  public.my_map()
  from public, anon, authenticated;
grant execute on function
  public.create_outing(text, text, text, double precision, double precision, date, date, text),
  public.update_outing(uuid, text, text, text, double precision, double precision, date, date, text),
  public.mark_outing_went(uuid),
  public.cancel_outing(uuid),
  public.my_month(),
  public.my_map()
  to authenticated;
