import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import { addPomodoroBlockRpc } from "@/lib/tracking-rpc";
import { createRetryScheduler } from "@/lib/pomodoro-sync";
import type { Database } from "@/lib/supabase/database.types";
import { reportTrackingError } from "../data/errors";
import { habitIdsOf } from "./kv";
import { reconcilePendingBlocks } from "./reconcile";
import { rawKv, storageFor } from "./wiring";

/**
 * Credits, when Hoy opens and whenever the app returns to the foreground, the Pomodoro blocks that finished while it was
 * killed (idempotent by block id; the server keeps `block_expired`). Trouble keeps them pending and retries with the web's
 * capped backoff. A credited block refreshes Hoy; what the server refused shows in Hoy's banner.
 */
export function useReconcilePomodoroBlocks({ userId, client, timeZone }: { userId: string; client: () => SupabaseClient<Database>; timeZone: string | undefined }) {
  const qc = useQueryClient();
  const ready = userId !== "" && timeZone !== undefined;
  useEffect(() => {
    if (!ready) return;
    const scheduler = createRetryScheduler({
      run: async () => {
        const r = await reconcilePendingBlocks({
          storage: storageFor(userId),
          habitIds: habitIdsOf(rawKv, userId),
          send: (habitId, block, topic) => addPomodoroBlockRpc(client(), habitId, block, topic),
          timeZone: timeZone as string,
          now: Date.now(),
        });
        if (r.credited) void qc.invalidateQueries({ queryKey: ["today", userId] });
        if (r.lines.length > 0) reportTrackingError(r.lines.join(" "));
        return r.retryable;
      },
    });
    scheduler.kick();
    const sub = AppState.addEventListener("change", (s) => s === "active" && scheduler.kick());
    return () => {
      scheduler.stop();
      sub.remove();
    };
    // the client factory is stable per session; the zone and user decide when to run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, timeZone, qc]);
}
