import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyCheckin, applyItem, removeCheckin, removeItem } from "@/domain/today-optimistic";
import { isStaleTap, staleDayNotice } from "@/lib/stale-day";
import { GENERIC } from "@/lib/tracking-copy";
import { checkInRpc, checkItemRpc, uncheckItemRpc, undoCheckInRpc } from "@/lib/tracking-rpc";
import type { Database } from "@/lib/supabase/database.types";
import type { TodayRaw } from "./today";

/** A refusal or failure from a tracking RPC, carrying the Spanish copy to show. */
export class TrackingError extends Error {}

/** A queued tap whose local day was over at replay: never sent, never retried, reported as one counted notice. */
export class StaleDayError extends Error {
  constructor() {
    super("stale day");
  }
}

/** What every tracked mutation carries, captured at tap time (the day rollover rule of M2 reads day/zone). */
export type TrackVars = { userId: string; clientId: string; day: string; zone: string };
export type CheckinVars = TrackVars & { habitId: string };
export type ItemVars = TrackVars & { itemId: string };

type Deps = { client: () => SupabaseClient<Database>; reportError: (message: string) => void };
type Ctx = { previous: TodayRaw | undefined };

const todayKey = (userId: string) => ["today", userId];

/** The generic failure may be transient; a specific server refusal is definitive. */
const retryable = (n: number, e: unknown) => n < 3 && !(e instanceof StaleDayError) && e instanceof TrackingError && e.message === GENERIC;

function unwrap(r: { ok: true } | { ok: false; error: string }) {
  if (!r.ok) throw new TrackingError(r.error);
}

/**
 * Registers the defaults of every `["track", op]` mutation. It runs when the client is created, before any
 * provider mounts, so mutations restored from a persisted cache already know their mutationFn. All of them share the
 * scope `track`, so the replay is serial. Optimistic edits go through the shared reducers; a refusal restores the
 * snapshot and reports the web copy.
 */
export function registerTrackingMutations(qc: QueryClient, deps: Deps) {
  // stale drops of the current replay run: the notice shows the running count, and it resets once the queue is idle
  let staleDropped = 0;
  const dropIfStale =
    <V extends TrackVars>(fn: (v: V) => Promise<unknown>) =>
    async (v: V) => {
      if (isStaleTap(v, Date.now())) throw new StaleDayError();
      return fn(v);
    };

  const optimistic =
    <V extends TrackVars>(edit: (state: TodayRaw, v: V) => TodayRaw) =>
    async (v: V): Promise<Ctx> => {
      const key = todayKey(v.userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TodayRaw>(key);
      if (previous) qc.setQueryData<TodayRaw>(key, edit(previous, v));
      return { previous };
    };

  const define = <V extends TrackVars>(
    op: string,
    mutationFn: (v: V) => Promise<unknown>,
    edit: (state: TodayRaw, v: V) => TodayRaw,
  ) =>
    qc.setMutationDefaults(["track", op], {
      mutationFn: dropIfStale(mutationFn),
      onMutate: optimistic(edit),
      onError: (error: unknown, v: V, ctx: Ctx | undefined) => {
        if (ctx?.previous) qc.setQueryData(todayKey(v.userId), ctx.previous);
        if (error instanceof StaleDayError) {
          staleDropped += 1;
          deps.reportError(staleDayNotice(staleDropped));
          if (qc.isMutating({ mutationKey: ["track"] }) <= 1) staleDropped = 0;
          return;
        }
        deps.reportError(error instanceof Error ? error.message : GENERIC);
      },
      onSettled: (_d: unknown, _e: unknown, v: V) => qc.invalidateQueries({ queryKey: todayKey(v.userId) }),
      retry: retryable,
      scope: { id: "track" },
    });

  define<CheckinVars>(
    "checkin",
    async (v) => {
      const r = await checkInRpc(deps.client(), v.habitId);
      if (!r.ok) throw new TrackingError(r.error);
      return r;
    },
    (s, v) => applyCheckin(s, v.habitId, `optimistic-${v.clientId}`),
  );
  define<CheckinVars>(
    "undo",
    async (v) => unwrap(await undoCheckInRpc(deps.client(), v.userId, v.habitId)),
    (s, v) => removeCheckin(s, v.habitId),
  );
  define<ItemVars>(
    "item",
    async (v) => {
      const r = await checkItemRpc(deps.client(), v.itemId);
      if (!r.ok) throw new TrackingError(r.error);
      return r;
    },
    (s, v) => applyItem(s, v.itemId, new Date().toISOString(), `optimistic-${v.clientId}`),
  );
  define<ItemVars>(
    "uncheckItem",
    async (v) => unwrap(await uncheckItemRpc(deps.client(), v.itemId)),
    (s, v) => removeItem(s, v.itemId),
  );
}
