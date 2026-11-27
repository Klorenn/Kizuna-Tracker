-- Trips are not groups. A stop is an outing. The client never reads or writes these tables.

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  name text not null,
  created_at timestamptz not null default now(),
  constraint trips_name_len check (char_length(name) between 1 and 60)
);

alter table public.outings
  add column trip_id uuid references public.trips (id) on delete set null;

create index trips_owner_idx on public.trips (owner_id);
create index outings_trip_idx on public.outings (trip_id);

alter table public.trips enable row level security;
revoke all on public.trips from public, anon, authenticated;

create trigger trips_forbid_deleted_actor
  before insert or update or delete on public.trips
  for each statement execute function public.forbid_deleted_actor();

create function public.create_trip(p_name text, p_outing_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_want int;
  v_have int;
  v_id uuid;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  if v_name is null or pg_catalog.char_length(v_name) > 60 then
    raise exception 'trip_name';
  end if;
  select count(distinct x) into v_want from pg_catalog.unnest(coalesce(p_outing_ids, array[]::uuid[])) as x;
  if v_want < 2 then
    raise exception 'trip_needs_two';
  end if;
  select count(*) into v_have
  from public.outings o
  where o.id in (select distinct x from pg_catalog.unnest(p_outing_ids) as x)
    and o.owner_id = v_uid
    and o.trip_id is null;
  if v_have <> v_want then
    raise exception 'not_found';
  end if;
  insert into public.trips (owner_id, name) values (v_uid, v_name) returning id into v_id;
  update public.outings o
  set trip_id = v_id
  where o.id in (select distinct x from pg_catalog.unnest(p_outing_ids) as x)
    and o.owner_id = v_uid
    and o.trip_id is null;
  return v_id;
end;
$$;

create function public.add_trip_stop(
  p_trip_id uuid,
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
  v_stop_month date;
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
  if not exists (select 1 from public.trips t where t.id = p_trip_id and t.owner_id = v_uid) then
    raise exception 'not_found';
  end if;
  if p_starts_on is null then
    raise exception 'invalid_dates';
  end if;
  v_stop_month := pg_catalog.date_trunc('month', p_starts_on::timestamp)::date;
  select c.place_name, c.place_detail, c.place_key, c.lat, c.lng, c.starts_on, c.ends_on, c.note
    into v_name, v_detail, v_key, v_lat, v_lng, v_starts, v_ends, v_note
  from public.outings_clean(
    p_place_name, p_place_detail, p_place_key, p_lat, p_lng, p_starts_on, p_ends_on, p_note, v_stop_month
  ) c;
  if v_stop_month <> v_month and not exists (
    select 1 from public.outings o
    where o.trip_id = p_trip_id and o.month_start = v_stop_month
  ) then
    raise exception 'stop_month';
  end if;
  insert into public.outings (
    owner_id, place_name, place_detail, place_key, lat, lng,
    month_start, starts_on, ends_on, note, status, trip_id
  ) values (
    v_uid, v_name, v_detail, v_key, v_lat, v_lng,
    v_stop_month, v_starts, v_ends, v_note, 'planned', p_trip_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function public.my_trips()
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
  v_rows jsonb;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select coalesce(pg_catalog.jsonb_agg(row_json order by created_at), '[]'::jsonb)
  into v_rows
  from (
    select
      t.created_at,
      pg_catalog.jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'stops', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', o.id,
              'place_name', o.place_name,
              'month_start', o.month_start,
              'starts_on', o.starts_on,
              'ends_on', o.ends_on,
              'status', o.status
            )
            order by o.starts_on, o.created_at
          )
          from public.outings o
          where o.trip_id = t.id
            and (
              t.owner_id = v_uid
              or exists (
                select 1 from public.outing_invites i
                where i.outing_id = o.id and i.invitee_id = v_uid and i.status = 'accepted'
              )
            )
        ), '[]'::jsonb)
      ) as row_json
    from public.trips t
    where t.owner_id = v_uid
       or exists (
         select 1
         from public.outings o
         join public.outing_invites i on i.outing_id = o.id
         where o.trip_id = t.id and i.invitee_id = v_uid and i.status = 'accepted'
       )
  ) listed;
  return v_rows;
end;
$$;

-- Own pins stay distinguishable so a trip can be built only from rows the caller already sees.
create or replace function public.my_map()
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
  v_plans jsonb;
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
        'went_on', o.went_on,
        'is_owner', o.owner_id = v_uid
      )
      order by o.starts_on, o.created_at
    ),
    '[]'::jsonb
  )
  into v_pins
  from public.outings o
  where o.status = 'went'
    and (
      o.owner_id = v_uid
      or exists (
        select 1 from public.outing_invites i
        where i.outing_id = o.id and i.invitee_id = v_uid and i.status = 'accepted'
      )
    );
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', o.id,
        'place_name', o.place_name,
        'lat', o.lat,
        'lng', o.lng,
        'starts_on', o.starts_on,
        'ends_on', o.ends_on,
        'is_owner', o.owner_id = v_uid
      )
      order by o.starts_on, o.created_at
    ),
    '[]'::jsonb
  )
  into v_plans
  from public.outings o
  where o.status = 'planned'
    and o.month_start < v_month
    and (
      o.owner_id = v_uid
      or exists (
        select 1 from public.outing_invites i
        where i.outing_id = o.id and i.invitee_id = v_uid and i.status = 'accepted'
      )
    );
  return pg_catalog.jsonb_build_object('pins', v_pins, 'plans', v_plans);
end;
$$;

revoke all on function
  public.create_trip(text, uuid[]),
  public.add_trip_stop(uuid, text, text, text, double precision, double precision, date, date, text),
  public.my_trips(),
  public.my_map()
  from public, anon, authenticated;
grant execute on function
  public.create_trip(text, uuid[]),
  public.add_trip_stop(uuid, text, text, text, double precision, double precision, date, date, text),
  public.my_trips(),
  public.my_map()
  to authenticated;
