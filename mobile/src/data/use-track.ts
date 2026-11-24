import { useMutation } from "@tanstack/react-query";
import type { TodayItem, TodayRow } from "@/domain/today";
import { newClientId } from "./ids";
import type { CheckinVars, ItemVars } from "./mutations";
import type { TodayRaw } from "./today";

/**
 * The tap handlers of Hoy. Each captures the clientId, local day and zone at tap time (the offline replay rule reads
 * them), then fires the `["track", op]` mutation whose defaults are registered on the query client.
 */
export function useTrack(userId: string, raw: Pick<TodayRaw, "today" | "timeZone"> | undefined) {
  const checkin = useMutation<unknown, Error, CheckinVars>({ mutationKey: ["track", "checkin"] });
  const undo = useMutation<unknown, Error, CheckinVars>({ mutationKey: ["track", "undo"] });
  const item = useMutation<unknown, Error, ItemVars>({ mutationKey: ["track", "item"] });
  const uncheckItem = useMutation<unknown, Error, ItemVars>({ mutationKey: ["track", "uncheckItem"] });
  const base = () => ({ userId, clientId: newClientId(), day: raw?.today ?? "", zone: raw?.timeZone ?? "" });
  return {
    check: (row: TodayRow) => checkin.mutate({ ...base(), habitId: row.id }),
    undo: (row: TodayRow) => undo.mutate({ ...base(), habitId: row.id }),
    toggleItem: (_row: TodayRow, it: TodayItem) =>
      (it.checked ? uncheckItem : item).mutate({ ...base(), itemId: it.id }),
  };
}
