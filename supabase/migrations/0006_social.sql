-- Social: invite redemption and the anonymous-safe public profile.

-- Redeems an invite code for the caller. Definer so a stranger can read the invite and
-- write the friendship without table access; codes cannot be enumerated (exact match only).
create function public.accept_invite(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.invites%rowtype;
  v_friendship public.friendships%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select i.* into v_invite
  from public.invites i
  join public.profiles p on p.id = i.inviter_id and p.deleted_at is null
  where i.code = p_code;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'invite_expired';
  end if;
  if v_invite.inviter_id = v_uid then
    raise exception 'invite_self';
  end if;

  select f.* into v_friendship
  from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(v_uid, v_invite.inviter_id)
    and greatest(f.requester_id, f.addressee_id) = greatest(v_uid, v_invite.inviter_id);
  if not found then
    insert into public.friendships (requester_id, addressee_id, status)
    values (v_invite.inviter_id, v_uid, 'accepted');
  elsif v_friendship.status = 'pending' then
    update public.friendships set status = 'accepted' where id = v_friendship.id;
  end if;
  return v_invite.inviter_id;
end;
$$;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- Public profile for /@username. Whitelisted fields only: never photos, birth date or
-- anything from non-public habits. Anonymous callers get null when nothing is public.
create function public.public_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_habits jsonb;
begin
  select p.id, p.username::text as username, p.display_name, p.avatar_path
    into v_profile
  from public.profiles p
  where p.username = p_username::extensions.citext and p.deleted_at is null;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'name', h.name,
      'icon', h.icon,
      'frequencyType', h.frequency_type,
      'targetPerWeek', h.target_per_week,
      'dates', coalesce((
        select jsonb_agg(to_char(c.local_date, 'YYYY-MM-DD') order by c.local_date)
        from public.checkins c
        where c.habit_id = h.id
          and c.rejected_at is null
          and c.local_date >= current_date - 182
      ), '[]'::jsonb)
    ) order by h.created_at), '[]'::jsonb)
    into v_habits
  from public.habits h
  where h.user_id = v_profile.id and h.visibility = 'public' and h.archived_at is null;

  if jsonb_array_length(v_habits) = 0 and (select auth.uid()) is null then
    return null;
  end if;

  return jsonb_build_object(
    'username', v_profile.username,
    'displayName', v_profile.display_name,
    'avatarPath', v_profile.avatar_path,
    'habits', v_habits
  );
end;
$$;
revoke execute on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;
