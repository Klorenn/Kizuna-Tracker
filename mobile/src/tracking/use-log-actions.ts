import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "../lib/supabase";
import type { TodayRaw } from "../data/today";
import { useCachedToday } from "../data/use-cached-today";
import { makeLogActions } from "./log-actions";

/**
 * The log screens' glue: today's row and check-in from the cached Hoy, and the save actions (online writes) that
 * refresh Hoy and the screen's own lists afterwards.
 */
export function useLogActions(habitId: string) {
  const qc = useQueryClient();
  const { userId, view } = useCachedToday();
  const row = view?.rows.find((r) => r.id === habitId) ?? null;
  const checkinId = () => qc.getQueryData<TodayRaw>(["today", userId])?.todayCheckins.find((c) => c.habit_id === habitId)?.id ?? null;
  const actions = useMemo(
    () =>
      makeLogActions({
        client: supabase,
        userId,
        habitId,
        checkinId,
        refresh: () => Promise.all([qc.invalidateQueries({ queryKey: ["today", userId] }), qc.invalidateQueries({ queryKey: ["log", userId] })]),
      }),
    // checkinId reads the live cache on each call
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, userId, habitId],
  );
  return { userId, row, actions, checkinId };
}
