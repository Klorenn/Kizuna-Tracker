-- Goals (weekly / total per habit), timezone change limited to once every 7 days,
-- and the public avatars bucket.

-- ------------------------------------------------------------------ goals
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  habit_id uuid not null references public.habits (id),
  kind text not null check (kind in ('weekly', 'total')),
  target int not null check (target > 0),
  starts_on date not null default current_date,
  deadline date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint goals_deadline_only_total check (kind = 'total' or deadline is null),
  constraint goals_weekly_max check (kind = 'total' or target <= 7)
);
create index goals_user_idx on public.goals (user_id);
create index goals_habit_idx on public.goals (habit_id);
alter table public.goals enable row level security;

create policy goals_select_owner on public.goals
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy goals_insert_owner on public.goals
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = (select auth.uid()) and h.archived_at is null
    )
  );
create policy goals_update_owner on public.goals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select on public.goals to authenticated;
grant insert (user_id, habit_id, kind, target, starts_on, deadline) on public.goals to authenticated;
grant update (archived_at) on public.goals to authenticated;

-- --------------------------------------------------------------- timezone
-- Already outside the column grant since 0004; stated again so the rule is explicit.
revoke update (timezone) on public.profiles from authenticated;

create function public.set_timezone(p_tz text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_changed timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz) then
    raise exception 'invalid_timezone' using errcode = 'P0001';
  end if;
  select p.timezone_changed_at into v_changed
  from public.profiles p
  where p.id = v_uid and p.deleted_at is null
  for update;
  if not found then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_changed is not null and v_changed > pg_catalog.now() - interval '7 days' then
    raise exception 'timezone_recently_changed' using errcode = 'P0001';
  end if;
  update public.profiles
  set timezone = p_tz, timezone_changed_at = pg_catalog.now()
  where id = v_uid;
end;
$$;
revoke execute on function public.set_timezone(text) from public, anon;
grant execute on function public.set_timezone(text) to authenticated;

-- ----------------------------------------------------------------- avatars
-- A profile only ever points at its own {id}.jpg.
alter table public.profiles
  add constraint profiles_avatar_path_shape check (avatar_path is null or avatar_path = id::text || '.jpg');

-- Public bucket (avatars are not private). Path: {user_id}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Writes only on the caller's own path (the app uploads server-side with the service role).
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '.jpg');
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '.jpg')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '.jpg');
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '.jpg');
