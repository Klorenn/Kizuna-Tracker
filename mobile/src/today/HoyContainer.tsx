import NetInfo from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { clearTrackingError, useTrackingError } from "../data/errors";
import { fetchToday, selectToday } from "../data/today";
import { useTrack } from "../data/use-track";
import { HoyView, type HoyState } from "./HoyView";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Props = { userId: string; client: () => SupabaseClient<Database>; onOpenHabit: (id: string) => void; onNavigate?: (path: string) => void };

/** Hoy with data and taps: the shared reads, optimistic mutations, and the error banner. */
export function HoyContainer({ userId, client, onOpenHabit, onNavigate }: Props) {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);

  const q = useQuery({
    queryKey: ["today", userId],
    queryFn: () => fetchToday(client(), userId),
    enabled: userId !== "",
    select: (raw) => selectToday(raw),
  });
  const track = useTrack(userId, q.data);
  const errorMessage = useTrackingError();

  const state: HoyState = q.data ? { kind: "ready", view: q.data } : q.isError ? { kind: "error", offline } : { kind: "loading" };
  return (
    <HoyView
      state={state}
      onRetry={() => void q.refetch()}
      errorMessage={errorMessage}
      onDismissError={clearTrackingError}
      actions={{
        onCheck: track.check,
        onUndo: track.undo,
        onItem: track.toggleItem,
        onOpen: (row) => onOpenHabit(row.id),
        onQuantity: (row, amount) => track.addQuantity(row.id, amount),
        onTime: (row) => onNavigate?.(`/registros/${row.id}/time`),
      }}
    />
  );
}
