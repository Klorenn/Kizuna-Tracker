import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { loadMediaRpc } from "@/lib/logs-rpc";
import { supabase } from "../../../../src/lib/supabase";
import { useLogActions } from "../../../../src/tracking/use-log-actions";
import { WatchPanel } from "../../../../src/tracking/WatchPanel";

/** registros/[habitId]/watch: what you watched today (online write; checks the habit in with it). */
export default function WatchScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const { userId, row, actions } = useLogActions(habitId);
  const media = useQuery({ queryKey: ["log", userId, "media"], queryFn: () => loadMediaRpc(supabase(), userId), enabled: userId !== "" });
  return <WatchPanel row={row} media={media.data ?? []} {...actions.watch} onBack={() => router.back()} />;
}
