-- A plan can land in any of the next 12 months, with an app friend or a name.

alter table public.outings
  add column guest_name text;

alter table public.outings
  add constraint outings_guest_name_len
  check (guest_name is null or char_length(guest_name) between 1 and 40);

drop function public.create_outing(text, text, text, double precision, double precision, date, date, text);

create function public.create_outing(
  p_place_name text,
  p_place_detail text,
  p_place_key text,
  p_lat double precision,
  p_lng double precision,
  p_starts_on date,
  p_ends_on date,
  p_note text,
  p_guest_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid;
  v_today date;
  v_current date;
  v_month date;
  v_name text;
  v_detail text;
  v_key text;
  v_lat double precision;
  v_lng double precision;
  v_starts date;
  v_ends date;
  v_note text;
  v_guest text;
  v_id uuid;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_current from public.outings_self() s;
  v_month := pg_catalog.date_trunc('month', p_starts_on::timestamp)::date;
  if p_starts_on is null
     or v_month < v_current
     or v_month >= (v_current + interval '12 months')::date then
    raise exception 'invalid_dates';
  end if;
  select c.place_name, c.place_detail, c.place_key, c.lat, c.lng, c.starts_on, c.ends_on, c.note
    into v_name, v_detail, v_key, v_lat, v_lng, v_starts, v_ends, v_note
  from public.outings_clean(
    p_place_name, p_place_detail, p_place_key, p_lat, p_lng, p_starts_on, p_ends_on, p_note, v_month
  ) c;
  v_guest := nullif(pg_catalog.btrim(coalesce(p_guest_name, '')), '');
  if v_guest is not null and pg_catalog.char_length(v_guest) > 40 then
    raise exception 'invalid_guest';
  end if;
  insert into public.outings (
    owner_id, place_name, place_detail, place_key, lat, lng,
    month_start, starts_on, ends_on, note, guest_name, status
  ) values (
    v_uid, v_name, v_detail, v_key, v_lat, v_lng,
    v_month, v_starts, v_ends, v_note, v_guest, 'planned'
  )
  returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function public.create_outing(text, text, text, double precision, double precision, date, date, text, text) from public, anon, authenticated;
grant execute on function public.create_outing(text, text, text, double precision, double precision, date, date, text, text) to authenticated;

create or replace function public.my_month()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
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
  where o.month_start = v_month
    and o.status = 'went'
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
        'place_detail', o.place_detail,
        'place_key', o.place_key,
        'lat', o.lat,
        'lng', o.lng,
        'starts_on', o.starts_on,
        'ends_on', o.ends_on,
        'note', o.note,
        'status', o.status,
        'went_on', o.went_on,
        'guest_name', o.guest_name,
        'companion_name', case when o.owner_id = v_uid then inv.first_name else owner_profile.first_name end,
        'invite_status', case when o.owner_id = v_uid then inv.status else 'accepted' end,
        'is_owner', o.owner_id = v_uid
      )
      order by o.starts_on, o.created_at
    ),
    '[]'::jsonb
  )
  into v_outings
  from public.outings o
  join public.profiles owner_profile on owner_profile.id = o.owner_id
  left join lateral (
    select i.status, pf.first_name
    from public.outing_invites i
    join public.profiles pf on pf.id = i.invitee_id
    where i.outing_id = o.id
      and i.status in ('pending', 'accepted')
    limit 1
  ) inv on true
  where o.month_start = v_month
    and (
      o.owner_id = v_uid
      or exists (
        select 1 from public.outing_invites i
        where i.outing_id = o.id and i.invitee_id = v_uid and i.status = 'accepted'
      )
    );
  return pg_catalog.jsonb_build_object(
    'month_start', v_month,
    'completed', v_completed,
    'outings', v_outings
  );
end;
$fn$;

create or replace function public.my_map()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_pins jsonb;
  v_plans jsonb;
  v_upcoming jsonb;
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
        'is_owner', o.owner_id = v_uid,
        'companion_id', case when o.owner_id = v_uid then inv.invitee_id else o.owner_id end,
        'companion_name', case when o.owner_id = v_uid then inv.first_name else owner_profile.first_name end
      )
      order by o.starts_on, o.created_at
    ),
    '[]'::jsonb
  )
  into v_pins
  from public.outings o
  left join public.profiles owner_profile on owner_profile.id = o.owner_id
  left join lateral (
    select i.invitee_id, pf.first_name
    from public.outing_invites i
    join public.profiles pf on pf.id = i.invitee_id
    where i.outing_id = o.id and i.status = 'accepted'
    limit 1
  ) inv on true
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
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', o.id,
        'place_name', o.place_name,
        'lat', o.lat,
        'lng', o.lng,
        'starts_on', o.starts_on,
        'ends_on', o.ends_on,
        'month_start', o.month_start,
        'guest_name', coalesce(
          case when o.owner_id = v_uid then inv.first_name else owner_profile.first_name end,
          o.guest_name
        )
      )
      order by o.starts_on, o.created_at
    ),
    '[]'::jsonb
  )
  into v_upcoming
  from public.outings o
  left join public.profiles owner_profile on owner_profile.id = o.owner_id
  left join lateral (
    select pf.first_name
    from public.outing_invites i
    join public.profiles pf on pf.id = i.invitee_id
    where i.outing_id = o.id
      and i.status in ('pending', 'accepted')
    limit 1
  ) inv on true
  where o.status = 'planned'
    and o.month_start > v_month
    and (
      o.owner_id = v_uid
      or exists (
        select 1 from public.outing_invites i
        where i.outing_id = o.id and i.invitee_id = v_uid and i.status = 'accepted'
      )
    );
  return pg_catalog.jsonb_build_object('pins', v_pins, 'plans', v_plans, 'upcoming', v_upcoming);
end;
$fn$;
