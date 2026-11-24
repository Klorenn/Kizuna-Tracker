import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { loadExercisesRpc } from "@/lib/logs-rpc";
import { supabase } from "../../../../src/lib/supabase";
import { useLogActions } from "../../../../src/tracking/use-log-actions";
import { WorkoutPanel } from "../../../../src/tracking/WorkoutPanel";

/** registros/[habitId]/workout: today's workout of one habit (online write; checks the habit in with it). */
export default function WorkoutScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const { userId, row, actions } = useLogActions(habitId);
  const exercises = useQuery({ queryKey: ["log", userId, "exercises"], queryFn: () => loadExercisesRpc(supabase(), userId), enabled: userId !== "" });
  return <WorkoutPanel row={row} exercises={exercises.data ?? []} {...actions.workout} onBack={() => router.back()} />;
}
