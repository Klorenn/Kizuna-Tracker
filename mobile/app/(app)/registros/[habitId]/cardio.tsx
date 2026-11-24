import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { loadCardioOutingsRpc } from "@/lib/logs-rpc";
import { supabase } from "../../../../src/lib/supabase";
import { CardioPanel } from "../../../../src/tracking/CardioPanel";
import { useLogActions } from "../../../../src/tracking/use-log-actions";

/** registros/[habitId]/cardio: today's outings of one habit (online writes; the first one checks the habit in). */
export default function CardioScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const { userId, row, actions, checkinId } = useLogActions(habitId);
  const id = checkinId();
  const outings = useQuery({ queryKey: ["log", userId, "cardio", id], queryFn: () => loadCardioOutingsRpc(supabase(), id!), enabled: userId !== "" && id !== null });
  return <CardioPanel row={row} outings={id ? (outings.data ?? []) : []} {...actions.cardio} onBack={() => router.back()} />;
}
