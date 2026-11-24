import { useMutation } from "@tanstack/react-query";
import type { TodayItem, TodayRow } from "@/domain/today";
import { newClientId } from "./ids";
import type {
  CheckinVars,
  ItemVars,
  PomodoroVars,
  QuantityAddVars,
  QuantityRemoveVars,
  TimeAddVars,
  TimeDeleteVars,
  TimeSetVars,
} from "./mutations";
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
  const quantityAdd = useMutation<unknown, Error, QuantityAddVars>({ mutationKey: ["track", "quantityAdd"] });
  const quantityRemove = useMutation<unknown, Error, QuantityRemoveVars>({ mutationKey: ["track", "quantityRemove"] });
  const timeAdd = useMutation<unknown, Error, TimeAddVars>({ mutationKey: ["track", "timeAdd"] });
  const timeSet = useMutation<unknown, Error, TimeSetVars>({ mutationKey: ["track", "timeSet"] });
  const timeDelete = useMutation<unknown, Error, TimeDeleteVars>({ mutationKey: ["track", "timeDelete"] });
  const pomodoro = useMutation<unknown, Error, PomodoroVars>({ mutationKey: ["track", "pomodoro"] });
  const base = () => ({ userId, clientId: newClientId(), day: raw?.today ?? "", zone: raw?.timeZone ?? "" });
  return {
    check: (row: TodayRow) => checkin.mutate({ ...base(), habitId: row.id }),
    undo: (row: TodayRow) => undo.mutate({ ...base(), habitId: row.id }),
    toggleItem: (_row: TodayRow, it: TodayItem) =>
      (it.checked ? uncheckItem : item).mutate({ ...base(), itemId: it.id }),
    addQuantity: (habitId: string, amount: number) => quantityAdd.mutate({ ...base(), habitId, amount }),
    removeQuantity: (entryId: string) => quantityRemove.mutate({ ...base(), entryId }),
    addTime: (habitId: string, minutes: number, topic: string | null) => timeAdd.mutate({ ...base(), habitId, minutes, topic }),
    setTime: (habitId: string, minutes: number, topic: string | null) => timeSet.mutate({ ...base(), habitId, minutes, topic }),
    deleteTime: (habitId: string) => timeDelete.mutate({ ...base(), habitId }),
    /** day/zone are those of the screen when the block started (the stale rule drops a block that ends on a later day) */
    creditBlock: (v: { habitId: string; minutes: number; endedAt: number; topic: string | null; blockId: string; day: string; zone: string }) =>
      pomodoro.mutate({ userId, clientId: v.blockId, day: v.day, zone: v.zone, habitId: v.habitId, minutes: v.minutes, endedAt: v.endedAt, topic: v.topic }),
  };
}
