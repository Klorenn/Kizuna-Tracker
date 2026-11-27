-- One companion per outing. These rows are not groups. The client never reads or writes this table.

create table public.outing_invites (
  id uuid primary key default gen_random_uuid(),
  outing_id uuid not null references public.outings (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id),
  status text not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint outing_invites_status check (status in ('pending', 'accepted', 'declined')),
  constraint outing_invites_responded check ((status = 'pending') = (responded_at is null)),
  constraint outing_invites_pair unique (outing_id, invitee_id)
);

create unique index outing_invites_one_open
  on public.outing_invites (outing_id)
  where status in ('pending', 'accepted');

create index outing_invites_invitee_status_idx
  on public.outing_invites (invitee_id, status);

alter table public.outing_invites enable row level security;

revoke all on public.outing_invites from public, anon, authenticated;

create trigger outing_invites_forbid_deleted_actor
  before insert or update or delete on public.outing_invites
  for each statement execute function public.forbid_deleted_actor();

-- Owner, planned, current month, one accepted friend. The function reads friendships itself.
create function public.invite_outing_companion(p_outing_id uuid, p_friend_id uuid)
returns uuid
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
  v_id uuid;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  if p_friend_id = v_uid
     or not exists (
       select 1 from public.friendships f
       where f.status = 'accepted'
         and (
           (f.requester_id = v_uid and f.addressee_id = p_friend_id)
           or (f.addressee_id = v_uid and f.requester_id = p_friend_id)
         )
     ) then
    raise exception 'not_friend';
  end if;
  select o.status, o.month_start into v_status, v_row_month
  from public.outings o
  where o.id = p_outing_id and o.owner_id = v_uid
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status <> 'planned' then
    raise exception 'outing_closed';
  end if;
  if v_row_month <> v_month then
    raise exception 'month_closed';
  end if;
  if exists (
    select 1 from public.outing_invites i
    where i.outing_id = p_outing_id and i.status in ('pending', 'accepted')
  ) then
    raise exception 'already_invited';
  end if;
  if exists (
    select 1 from public.outing_invites i
    where i.outing_id = p_outing_id and i.invitee_id = p_friend_id and i.status = 'declined'
  ) then
    raise exception 'invite_closed';
  end if;
  insert into public.outing_invites (outing_id, invitee_id, status)
  values (p_outing_id, p_friend_id, 'pending')
  returning id into v_id;
  return v_id;
end;
$$;

-- Invitee only, and only from pending. Accepting a closed month is allowed.
create function public.respond_outing_invite(p_invite_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_status text;
  v_outing uuid;
  v_owner uuid;
  v_place text;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select i.status, i.outing_id into v_status, v_outing
  from public.outing_invites i
  where i.id = p_invite_id and i.invitee_id = v_uid
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status <> 'pending' then
    raise exception 'invite_closed';
  end if;
  update public.outing_invites
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = pg_catalog.now()
  where id = p_invite_id and invitee_id = v_uid and status = 'pending';
  select o.owner_id, o.place_name into v_owner, v_place
  from public.outings o
  where o.id = v_outing;
  return pg_catalog.jsonb_build_object('owner_id', v_owner, 'place_name', v_place, 'outing_id', v_outing);
end;
$$;

-- The caller's invite for this outing, or null. Nothing of the floor or of other outings.
create function public.my_outing_invite(p_outing_id uuid)
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
  v_result jsonb;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select pg_catalog.jsonb_build_object(
    'invite_id', i.id,
    'status', i.status,
    'place_name', o.place_name,
    'place_detail', o.place_detail,
    'lat', o.lat,
    'lng', o.lng,
    'starts_on', o.starts_on,
    'ends_on', o.ends_on,
    'owner_name', p.first_name
  )
  into v_result
  from public.outing_invites i
  join public.outings o on o.id = i.outing_id
  join public.profiles p on p.id = o.owner_id
  where i.outing_id = p_outing_id
    and i.invitee_id = v_uid
    and i.status in ('pending', 'accepted');
  return v_result;
end;
$$;

create or replace function public.mark_outing_went(p_id uuid)
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
  where o.id = p_id
    and (
      o.owner_id = v_uid
      or exists (
        select 1 from public.outing_invites i
        where i.outing_id = o.id and i.invitee_id = v_uid and i.status = 'accepted'
      )
    )
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
  where id = p_id and status = 'planned';
end;
$$;

-- The phase 1 function returns void. Postgres rejects create or replace when the return type changes.
drop function public.cancel_outing(uuid);

create function public.cancel_outing(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_today date;
  v_month date;
  v_status text;
  v_invitee uuid;
  v_place text;
begin
  select s.uid, s.today, s.month_start into v_uid, v_today, v_month from public.outings_self() s;
  select o.status, o.place_name into v_status, v_place
  from public.outings o
  where o.id = p_id and o.owner_id = v_uid
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status = 'went' then
    raise exception 'outing_closed';
  end if;
  select i.invitee_id into v_invitee
  from public.outing_invites i
  where i.outing_id = p_id and i.status in ('pending', 'accepted')
  limit 1;
  delete from public.outings
  where id = p_id and owner_id = v_uid and status = 'planned';
  return pg_catalog.jsonb_build_object('invitee_id', v_invitee, 'place_name', v_place);
end;
$$;

create or replace function public.my_month()
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
$$;

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
        'went_on', o.went_on
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
        'ends_on', o.ends_on
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
  public.invite_outing_companion(uuid, uuid),
  public.respond_outing_invite(uuid, boolean),
  public.my_outing_invite(uuid),
  public.mark_outing_went(uuid),
  public.cancel_outing(uuid),
  public.my_month(),
  public.my_map()
  from public, anon, authenticated;
grant execute on function
  public.invite_outing_companion(uuid, uuid),
  public.respond_outing_invite(uuid, boolean),
  public.my_outing_invite(uuid),
  public.mark_outing_went(uuid),
  public.cancel_outing(uuid),
  public.my_month(),
  public.my_map()
  to authenticated;
