-- A place the person already went to. The day is optional.

alter table public.outings
  add column undated boolean not null default false;

alter table public.outings drop constraint outings_went_iff;

alter table public.outings add constraint outings_went_iff check (
  (status = 'planned' and went_on is null and not undated)
  or (status = 'went' and went_on is not null and not undated)
  or (status = 'went' and went_on is null and undated)
);

create function public.log_visit(
  p_place_name text,
  p_place_detail text,
  p_place_key text,
  p_lat double precision,
  p_lng double precision,
  p_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid;
  v_today date;
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
  v_id uuid;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  if p_on is not null and (p_on > v_today or p_on < (v_today - interval '30 years')::date) then
    raise exception 'visit_date';
  end if;
  v_target := coalesce(p_on, v_today);
  select c.place_name, c.place_detail, c.place_key, c.lat, c.lng, c.starts_on, c.ends_on, c.note
    into v_name, v_detail, v_key, v_lat, v_lng, v_starts, v_ends, v_note
  from public.outings_clean(
    p_place_name, p_place_detail, p_place_key, p_lat, p_lng,
    v_target, v_target, null,
    pg_catalog.date_trunc('month', v_target::timestamp)::date
  ) c;
  if p_on is null then
    insert into public.outings (
      owner_id, place_name, place_detail, place_key, lat, lng,
      month_start, starts_on, ends_on, note, status, went_on, undated
    ) values (
      v_uid, v_name, v_detail, v_key, v_lat, v_lng,
      '1970-01-01', '1970-01-01', '1970-01-01', null, 'went', null, true
    )
    returning id into v_id;
  else
    insert into public.outings (
      owner_id, place_name, place_detail, place_key, lat, lng,
      month_start, starts_on, ends_on, note, status, went_on, undated
    ) values (
      v_uid, v_name, v_detail, v_key, v_lat, v_lng,
      pg_catalog.date_trunc('month', p_on::timestamp)::date, p_on, p_on, null, 'went', p_on, false
    )
    returning id into v_id;
  end if;
  return v_id;
end;
$fn$;

revoke all on function public.log_visit(text, text, text, double precision, double precision, date) from public, anon, authenticated;
grant execute on function public.log_visit(text, text, text, double precision, double precision, date) to authenticated;

create or replace function public.my_month_index()
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
      and not o.undated
    group by o.month_start
  ) s;
  return v_rows;
end;
$fn$;
