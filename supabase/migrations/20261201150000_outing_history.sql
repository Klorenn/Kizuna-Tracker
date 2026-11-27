-- Past months of the owner, and a planned copy in the next month.
-- The copy does not carry Fui, the photo, the trip, or the invitation.
-- The client never reads or writes outings directly.

create function public.my_month_index()
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
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'month_start', s.month_start,
        'completed', s.completed
      )
      order by s.month_start desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      o.month_start,
      (count(*) filter (where o.status = 'went'))::int as completed
    from public.outings o
    where o.owner_id = v_uid
    group by o.month_start
  ) s;
  return v_rows;
end;
$$;

create function public.outings_shift_month(p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (
    (pg_catalog.date_trunc('month', p_day::timestamp) + interval '1 month')::date
    + (
      least(
        pg_catalog.date_part('day', p_day)::int,
        pg_catalog.date_part(
          'day',
          (pg_catalog.date_trunc('month', p_day::timestamp) + interval '2 month')::date - 1
        )::int
      ) - 1
    )
  )
$$;

create function public.repeat_outing(p_id uuid)
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
  v_new_starts date;
  v_new_ends date;
  v_id uuid;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select o.place_name, o.place_detail, o.place_key, o.lat, o.lng, o.starts_on, o.ends_on, o.note
    into v_name, v_detail, v_key, v_lat, v_lng, v_starts, v_ends, v_note
  from public.outings o
  where o.id = p_id and o.owner_id = v_uid;
  if not found then
    raise exception 'not_found';
  end if;
  v_new_starts := public.outings_shift_month(v_starts);
  v_new_ends := public.outings_shift_month(v_ends);
  insert into public.outings (
    owner_id, place_name, place_detail, place_key, lat, lng,
    month_start, starts_on, ends_on, note, status
  ) values (
    v_uid, v_name, v_detail, v_key, v_lat, v_lng,
    pg_catalog.date_trunc('month', v_new_starts::timestamp)::date,
    v_new_starts, v_new_ends, v_note, 'planned'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.outings_shift_month(date) from public, anon, authenticated;

revoke all on function public.my_month_index(), public.repeat_outing(uuid)
  from public, anon, authenticated;
grant execute on function public.my_month_index(), public.repeat_outing(uuid)
  to authenticated;
