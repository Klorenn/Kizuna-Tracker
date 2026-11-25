-- Covering indexes for foreign keys flagged by the Supabase performance advisor (unindexed_foreign_keys).
-- Additive and idempotent: only `create index if not exists`, no column or data change.
begin;

create index if not exists cardio_entries_habit_idx on public.cardio_entries (habit_id);
create index if not exists challenge_item_results_player_idx on public.challenge_item_results (player_id);
create index if not exists challenge_items_proposed_by_idx on public.challenge_items (proposed_by);
create index if not exists challenges_cancel_requested_by_idx on public.challenges (cancel_requested_by);
create index if not exists checkins_rejected_by_idx on public.checkins (rejected_by);
create index if not exists group_week_results_user_idx on public.group_week_results (user_id);
create index if not exists pomodoro_blocks_habit_idx on public.pomodoro_blocks (habit_id);
create index if not exists reading_entries_habit_idx on public.reading_entries (habit_id);
create index if not exists time_entries_habit_idx on public.time_entries (habit_id);
create index if not exists watch_entries_habit_idx on public.watch_entries (habit_id);
create index if not exists workout_sessions_habit_idx on public.workout_sessions (habit_id);

commit;
