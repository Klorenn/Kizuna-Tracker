-- Per-habit identity color. The db stores palette keys (src/domain/habit-colors.ts), never hex:
-- the colors themselves are CSS tokens tuned for the light and the dark theme.

-- Default color of each predefined habit; custom habits (and anything unknown) are indigo.
-- Mirrors PRESET_COLOR in src/domain/habit-colors.ts.
create function public.habit_preset_color(p_preset text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_preset
    when 'gym' then 'durazno'
    when 'water' then 'cielo'
    when 'study' then 'lavanda'
    when 'read' then 'arena'
    when 'walk' then 'salvia'
    when 'sleep' then 'indigo'
    when 'eat_well' then 'oliva'
    else 'indigo'
  end
$$;
revoke execute on function public.habit_preset_color(text) from public, anon, authenticated;

alter table public.habits
  add column color text not null default 'indigo'
    constraint habits_color_check
    check (color in ('salvia', 'durazno', 'lavanda', 'arena', 'cielo', 'rosa', 'oliva', 'indigo'));

-- Existing rows: presets take their default color, custom habits keep indigo.
update public.habits set color = public.habit_preset_color(preset) where preset is not null;

-- Owners pick the color when creating or editing (RLS already limits writes to own habits).
grant insert (color) on public.habits to authenticated;
grant update (color) on public.habits to authenticated;

-- Public profile: same whitelist as 0006 plus the color key of each public habit.
create or replace function public.public_profile(p_username text)
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
      'color', h.color,
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
