-- One https link on the trip (a Drive folder, or whatever holds the trip).
-- The owner writes it. Anyone who can already see the trip can open it.
-- The client never reads or writes trips directly.

alter table public.trips
  add column if not exists link text;

alter table public.trips drop constraint if exists trips_link_https;

alter table public.trips
  add constraint trips_link_https check (
    link is null
    or (
      char_length(link) <= 500
      and pg_catalog.strpos(link, 'https://') = 1
      and pg_catalog.strpos(link, ' ') = 0
      and pg_catalog.strpos(split_part(split_part(link, '://', 2), '/', 1), '@') = 0
    )
  );

create or replace function public.set_trip_link(p_id uuid, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_link text := nullif(pg_catalog.btrim(p_link), '');
  v_host text;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  if v_link is not null then
    v_host := pg_catalog.split_part(pg_catalog.split_part(v_link, '://', 2), '/', 1);
    if pg_catalog.char_length(v_link) > 500
      or pg_catalog.strpos(v_link, 'https://') <> 1
      or pg_catalog.strpos(v_link, ' ') > 0
      or v_host = ''
      or pg_catalog.strpos(v_host, '@') > 0
    then
      raise exception 'invalid_link';
    end if;
  end if;
  update public.trips
  set link = v_link
  where id = p_id and owner_id = v_uid;
  if not found then
    raise exception 'not_found';
  end if;
end;
$fn$;

create or replace function public.my_trips()
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
  select coalesce(pg_catalog.jsonb_agg(row_json order by created_at), '[]'::jsonb)
  into v_rows
  from (
    select
      t.created_at,
      pg_catalog.jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'link', t.link,
        'is_owner', t.owner_id = v_uid,
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
$fn$;

revoke all on function public.set_trip_link(uuid, text) from public, anon, authenticated;
grant execute on function public.set_trip_link(uuid, text) to authenticated;
