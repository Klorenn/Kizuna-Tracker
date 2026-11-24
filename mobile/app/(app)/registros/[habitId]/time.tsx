import { useLocalSearchParams, useRouter } from "expo-router";
import { useCachedToday } from "../../../../src/data/use-cached-today";
import { useTrack } from "../../../../src/data/use-track";
import { TimePanel } from "../../../../src/tracking/TimePanel";

/** registros/[habitId]/time: add, fix or remove today's time of one habit, or start a Pomodoro. */
export default function TimeScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const { userId, view } = useCachedToday();
  const track = useTrack(userId, view);
  const row = view?.rows.find((r) => r.id === habitId) ?? null;
  return (
    <TimePanel
      row={row}
      onAdd={(m, t) => track.addTime(habitId, m, t)}
      onSet={(m, t) => track.setTime(habitId, m, t)}
      onDelete={() => track.deleteTime(habitId)}
      onPomodoro={() => router.push(`/registros/${habitId}/pomodoro`)}
      onBack={() => router.back()}
    />
  );
}
