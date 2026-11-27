-- One photo per outing, private bucket. The client never reads or writes outing-photos.
-- Metadata is stripped in the route before upload. Coordinates are not read from the file.

alter table public.outings
  add column photo_path text;

create unique index outings_photo_path_unique
  on public.outings (photo_path)
  where photo_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('outing-photos', 'outing-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No policies: authenticated cannot read or write the bucket. The route uses the service role.

create function public.set_outing_photo(p_user_id uuid, p_outing_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_outing_id is null or p_path is distinct from (p_user_id::text || '/' || p_outing_id::text || '.jpg') then
    raise exception 'not_found';
  end if;
  if not exists (
    select 1 from public.outings o
    where o.id = p_outing_id
      and (
        o.owner_id = p_user_id
        or exists (
          select 1 from public.outing_invites i
          where i.outing_id = o.id and i.invitee_id = p_user_id and i.status = 'accepted'
        )
      )
  ) then
    raise exception 'not_found';
  end if;
  update public.outings set photo_path = p_path where id = p_outing_id;
end;
$$;

create function public.outing_photo_path(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_path text;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select o.photo_path into v_path
  from public.outings o
  where o.id = p_id
    and o.photo_path is not null
    and (
      o.owner_id = v_uid
      or exists (
        select 1 from public.outing_invites i
        where i.outing_id = o.id and i.invitee_id = v_uid and i.status = 'accepted'
      )
    );
  return v_path;
end;
$$;

-- Pins the caller can already see also carry the accepted companion, so the quiet stat
-- stays on those rows and does not open a new read.
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
  return pg_catalog.jsonb_build_object('pins', v_pins, 'plans', v_plans);
end;
$$;

revoke all on function public.set_outing_photo(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_outing_photo(uuid, uuid, text) to service_role;

revoke all on function public.outing_photo_path(uuid), public.my_map() from public, anon, authenticated;
grant execute on function public.outing_photo_path(uuid), public.my_map() to authenticated;
