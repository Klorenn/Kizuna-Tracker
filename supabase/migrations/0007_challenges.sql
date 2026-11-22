-- Challenges: stricter proposals, accept/decline, mutual cancel, and photo rejection.

-- ------------------------------------------------------------ proposal policy
-- Recreated: the creator's habit must be theirs, active, not private, and the challenge's
-- requires_photo must mirror the habit (habits with items never require a photo).
drop policy challenges_insert_creator on public.challenges;
create policy challenges_insert_creator on public.challenges
  for insert to authenticated
  with check (
    creator_id = (select auth.uid())
    and status = 'proposed'
    and public.is_friend((select auth.uid()), rival_id)
    and exists (
      select 1 from public.habits h
      where h.id = creator_habit_id
        and h.user_id = (select auth.uid())
        and h.visibility <> 'private'
        and h.archived_at is null
        and h.requires_photo = challenges.requires_photo
    )
  );

-- ------------------------------------------------------------ respond_challenge
-- Only the rival, only while proposed. Accepting fixes the rival's habit and the start
-- date in the challenge's timezone: daily = tomorrow, weekly = next Monday.
create function public.respond_challenge(
  p_id uuid,
  p_accept boolean,
  p_rival_habit_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c public.challenges%rowtype;
  v_today date;
  v_requires_photo boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into c from public.challenges where id = p_id for update;
  if not found then
    raise exception 'challenge_not_found';
  end if;
  if c.rival_id <> v_uid then
    raise exception 'not_rival';
  end if;
  if c.status <> 'proposed' then
    raise exception 'challenge_not_proposed';
  end if;

  if not p_accept then
    update public.challenges set status = 'declined' where id = p_id;
    return;
  end if;

  if p_rival_habit_id is null then
    raise exception 'rival_habit_required';
  end if;
  select h.requires_photo into v_requires_photo
  from public.habits h
  where h.id = p_rival_habit_id
    and h.user_id = v_uid
    and h.archived_at is null
    and h.visibility <> 'private';
  if not found then
    raise exception 'rival_habit_invalid';
  end if;
  if c.requires_photo and not v_requires_photo then
    raise exception 'rival_habit_needs_photo';
  end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = c.creator_id and f.addressee_id = c.rival_id)
        or (f.requester_id = c.rival_id and f.addressee_id = c.creator_id))
  ) then
    raise exception 'not_friends';
  end if;

  v_today := (now() at time zone c.timezone)::date;
  update public.challenges
  set status = 'active',
      rival_habit_id = p_rival_habit_id,
      starts_on = case
        when c.frequency_type = 'daily' then v_today + 1
        else v_today + (8 - extract(isodow from v_today)::int)
      end
  where id = p_id;
end;
$$;

-- ------------------------------------------------------------ request_cancel
-- Proposed: the creator withdraws it at once. Active: both sides must ask; the second
-- request cancels. Returns true when the challenge ended up cancelled.
create function public.request_cancel(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c public.challenges%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into c from public.challenges where id = p_id for update;
  if not found or v_uid not in (c.creator_id, c.rival_id) then
    raise exception 'challenge_not_found';
  end if;

  if c.status = 'proposed' and v_uid = c.creator_id then
    update public.challenges set status = 'cancelled' where id = p_id;
    return true;
  end if;
  if c.status <> 'active' then
    raise exception 'challenge_not_cancellable';
  end if;

  if c.cancel_requested_by is not null and c.cancel_requested_by <> v_uid then
    update public.challenges set status = 'cancelled' where id = p_id;
    return true;
  end if;
  if c.cancel_requested_by is null then
    update public.challenges set cancel_requested_by = v_uid where id = p_id;
  end if;
  return false;
end;
$$;

-- ------------------------------------------------------ cancel_challenges_between
-- Used when two people stop being friends. Only touches challenges the caller is in.
create function public.cancel_challenges_between(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  update public.challenges
  set status = 'cancelled'
  where status in ('proposed', 'active')
    and ((creator_id = v_uid and rival_id = p_other)
      or (creator_id = p_other and rival_id = v_uid));
end;
$$;

-- ------------------------------------------------------------ reject_checkin
-- The rival of an active photo challenge can reject the owner's photo within 24 h of
-- the check-in. A rejected check-in no longer counts; the owner gets a notification.
create function public.reject_checkin(p_checkin_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  k public.checkins%rowtype;
  v_challenge uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_reason is null or p_reason not in ('not_habit', 'duplicate', 'unclear', 'other') then
    raise exception 'invalid_reason';
  end if;
  select * into k from public.checkins where id = p_checkin_id for update;
  if not found or k.photo_path is null then
    raise exception 'checkin_not_found';
  end if;

  select c.id into v_challenge
  from public.challenges c
  where c.status = 'active'
    and c.requires_photo
    and ((c.creator_id = v_uid and c.rival_id = k.user_id and c.rival_habit_id = k.habit_id)
      or (c.rival_id = v_uid and c.creator_id = k.user_id and c.creator_habit_id = k.habit_id))
  limit 1;
  if v_challenge is null then
    raise exception 'not_rival';
  end if;
  if k.rejected_at is not null then
    raise exception 'already_rejected';
  end if;
  if k.created_at + interval '24 hours' <= now() then
    raise exception 'reject_window_closed';
  end if;

  update public.checkins
  set rejected_at = now(), rejected_by = v_uid, reject_reason = p_reason
  where id = k.id;
  insert into public.notifications (user_id, type, payload)
  values (k.user_id, 'photo_rejected', jsonb_build_object(
    'checkin_id', k.id, 'habit_id', k.habit_id, 'challenge_id', v_challenge,
    'reason', p_reason, 'rejected_by', v_uid));
end;
$$;

grant execute on function public.respond_challenge(uuid, boolean, uuid) to authenticated;
grant execute on function public.request_cancel(uuid) to authenticated;
grant execute on function public.cancel_challenges_between(uuid) to authenticated;
grant execute on function public.reject_checkin(uuid, text) to authenticated;
