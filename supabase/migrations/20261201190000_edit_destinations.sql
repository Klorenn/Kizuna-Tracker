-- Called by updateOutingWith and cancelOutingWith in src/lib/outing-actions.ts,
-- and by loadMyMap via public.my_map. No earlier migration lets the owner
-- edit a visited row or a plan outside the current month.

create or replace function public.update_outing(
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
as $fn$
declare
  v_uid uuid;
  v_today date;
  v_current date;
  v_status text;
  v_month date;
  v_target date;
  v_name text;
  v_detail text;
  v_key text;
  v_lat double precision;
  v_lng double precision;
  v_starts date;
  v_ends date;
  v_note text;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_current from public.outings_self() s;
  select o.status into v_status
  from public.outings o
  where o.id = p_id and o.owner_id = v_uid
  for update;
  if not found then
    raise exception 'not_found';
  end if;

  if v_status = 'went' then
    if p_starts_on is not null and (p_starts_on > v_today or p_starts_on < (v_today - interval '30 years')::date) then
      raise exception 'visit_date';
    end if;
    v_target := coalesce(p_starts_on, v_today);
    select c.place_name, c.place_detail, c.place_key, c.lat, c.lng, c.starts_on, c.ends_on, c.note
      into v_name, v_detail, v_key, v_lat, v_lng, v_starts, v_ends, v_note
    from public.outings_clean(
      p_place_name, p_place_detail, p_place_key, p_lat, p_lng,
      v_target, v_target, null,
      pg_catalog.date_trunc('month', v_target::timestamp)::date
    ) c;
    if p_starts_on is null then
      update public.outings set
        place_name = v_name,
        place_detail = v_detail,
        place_key = v_key,
        lat = v_lat,
        lng = v_lng,
        month_start = '1970-01-01',
        starts_on = '1970-01-01',
        ends_on = '1970-01-01',
        went_on = null,
        undated = true
      where id = p_id and owner_id = v_uid and status = 'went';
    else
      update public.outings set
        place_name = v_name,
        place_detail = v_detail,
        place_key = v_key,
        lat = v_lat,
        lng = v_lng,
        month_start = pg_catalog.date_trunc('month', p_starts_on::timestamp)::date,
        starts_on = p_starts_on,
        ends_on = p_starts_on,
        went_on = p_starts_on,
        undated = false
      where id = p_id and owner_id = v_uid and status = 'went';
    end if;
    return;
  end if;

  v_month := pg_catalog.date_trunc('month', p_starts_on::timestamp)::date;
  if p_starts_on is null
     or v_month < (v_current - interval '30 years')::date
     or v_month >= (v_current + interval '12 months')::date then
    raise exception 'invalid_dates';
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
    month_start = v_month,
    starts_on = v_starts,
    ends_on = v_ends,
    note = v_note
  where id = p_id and owner_id = v_uid and status = 'planned';
end;
$fn$;

create or replace function public.cancel_outing(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_invitee uuid;
  v_place text;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select o.place_name into v_place
  from public.outings o
  where o.id = p_id and o.owner_id = v_uid
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  select i.invitee_id into v_invitee
  from public.outing_invites i
  where i.outing_id = p_id and i.status in ('pending', 'accepted')
  limit 1;
  delete from public.outings
  where id = p_id and owner_id = v_uid;
  return pg_catalog.jsonb_build_object('invitee_id', v_invitee, 'place_name', v_place);
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
        'place_detail', o.place_detail,
        'place_key', o.place_key,
        'lat', o.lat,
        'lng', o.lng,
        'starts_on', o.starts_on,
        'ends_on', o.ends_on,
        'note', o.note,
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
        'place_detail', o.place_detail,
        'place_key', o.place_key,
        'lat', o.lat,
        'lng', o.lng,
        'starts_on', o.starts_on,
        'ends_on', o.ends_on,
        'month_start', o.month_start,
        'note', o.note,
        'is_owner', o.owner_id = v_uid,
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
