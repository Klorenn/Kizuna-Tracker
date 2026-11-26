-- Yesterday's boolean check-in, open until local noon, and a solo practice challenge.
-- create_checkin stays today-only. Clients still cannot insert checkins.

create or replace function public.create_checkin_on(p_habit_id uuid, p_date date)
returns table (checkin_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_requires_photo boolean;
  v_log_type text;
  v_today date;
  v_hour int;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.timezone into v_tz from public.profiles p
  where p.id = v_uid and p.deleted_at is null;
  if not found then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select h.requires_photo, h.log_type into v_requires_photo, v_log_type
  from public.habits h
  where h.id = p_habit_id and h.user_id = v_uid and h.archived_at is null;
  if not found then
    raise exception 'habit_not_found';
  end if;
  if v_log_type = 'quantity' then
    raise exception 'quantity_habit';
  end if;
  if exists (
    select 1 from public.habit_items i
    where i.habit_id = p_habit_id and i.archived_at is null
  ) then
    raise exception 'habit_has_items';
  end if;
  if v_requires_photo then
    raise exception 'photo_required';
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_hour := extract(hour from (now() at time zone v_tz));
  if p_date is distinct from v_today
     and not (p_date = v_today - 1 and v_hour < 12) then
    raise exception 'date_locked';
  end if;

  insert into public.checkins as c (habit_id, user_id, local_date)
  values (p_habit_id, v_uid, p_date)
  on conflict (habit_id, local_date) do nothing
  returning c.id into v_id;

  if v_id is not null then
    return query select v_id, true;
  else
    return query
      select c.id, false from public.checkins c
      where c.habit_id = p_habit_id and c.local_date = p_date;
  end if;
end;
$$;

revoke all on function public.create_checkin_on(uuid, date) from public, anon;
grant execute on function public.create_checkin_on(uuid, date) to authenticated;

create table public.personal_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  habit_id uuid not null references public.habits (id),
  frequency_type text not null check (frequency_type in ('daily', 'weekly')),
  target_per_week integer check (target_per_week between 1 and 7),
  weeks integer not null check (weeks between 1 and 12),
  fine_amount integer not null check (fine_amount between 1 and 10000000),
  starts_on date not null,
  timezone text not null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (frequency_type = 'daily' and target_per_week is null)
    or (frequency_type = 'weekly' and target_per_week is not null)
  )
);

create unique index personal_challenges_one_open
  on public.personal_challenges (user_id)
  where cancelled_at is null;

alter table public.personal_challenges enable row level security;

create policy personal_challenges_own on public.personal_challenges
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      cancelled_at is not null
      or exists (
        select 1 from public.habits h
        where h.id = habit_id and h.user_id = auth.uid() and h.archived_at is null
      )
    )
  );

grant select, insert, update on public.personal_challenges to authenticated;
