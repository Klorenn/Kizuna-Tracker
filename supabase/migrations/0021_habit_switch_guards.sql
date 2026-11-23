-- Habit switch guards, for direct client updates of public.habits (additive; habits_quantity_guard
-- from 0018 is untouched and keeps every check it has).
--
--  1. A habit used by a proposed or active challenge cannot switch TO quantity (0018's guard only
--     looks at habits that already are quantity): the rival would see its completion rule change.
--     -> habit_in_challenge
--  2. Switching to or from quantity, or changing the unit of a quantity habit, is refused while the
--     habit has a check-in on the owner's current local date: the check-in would stay, showing done
--     at 0 of the goal, and could never be undone. -> checkin_today
--
-- Same technique as checkins_quantity_guard: SECURITY INVOKER, so current_user tells a direct client
-- write (authenticated / anon) from a definer RPC, the service role and the table owner, which are
-- not subject to it. The owner of the row is the caller (RLS), so the reads below are visible to it.
create function public.habits_switch_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.log_type = 'quantity' and old.log_type is distinct from 'quantity' and exists (
    select 1 from public.challenges c
    where c.status in ('proposed', 'active')
      and (c.creator_habit_id = new.id or c.rival_habit_id = new.id)
  ) then
    raise exception 'habit_in_challenge';
  end if;

  if (new.log_type is distinct from old.log_type and (new.log_type = 'quantity' or old.log_type = 'quantity'))
     or (old.log_type = 'quantity' and new.log_type = 'quantity' and new.quantity_unit is distinct from old.quantity_unit) then
    select (pg_catalog.now() at time zone p.timezone)::date into v_today
    from public.profiles p where p.id = new.user_id;
    if v_today is not null and exists (
      select 1 from public.checkins c where c.habit_id = new.id and c.local_date = v_today
    ) then
      raise exception 'checkin_today';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.habits_switch_guard() from public, anon, authenticated;
create trigger habits_switch_guard
  before update of log_type, quantity_unit on public.habits
  for each row execute function public.habits_switch_guard();
