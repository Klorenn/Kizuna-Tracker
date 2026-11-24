import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useCachedToday } from "../../../../src/data/use-cached-today";
import { useTrack } from "../../../../src/data/use-track";
import { pomodoroStore } from "../../../../src/pomodoro";
import { PomodoroPanel } from "../../../../src/pomodoro/PomodoroPanel";
import type { PomodoroView } from "../../../../src/pomodoro/store";

/** registros/[habitId]/pomodoro: a focus timer that ends as a local notification; saving credits the block through the queue. */
export default function PomodoroScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const router = useRouter();
  const { userId, view: today } = useCachedToday();
  const track = useTrack(userId, today);
  const row = today?.rows.find((r) => r.id === habitId) ?? null;
  const [view, setView] = useState<PomodoroView>(() => pomodoroStore.view());
  const [error, setError] = useState<string | null>(null);

  // the remaining time is recomputed from the stored start instant: every second, and when the app comes back
  const refresh = useCallback(() => setView(pomodoroStore.view()), []);
  useEffect(() => {
    const id = setInterval(refresh, 1000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refresh]);

  // a timer of another habit is not this screen's to show
  const mine: PomodoroView = view.kind !== "idle" && view.habitId !== habitId ? { kind: "idle" } : view;

  const start = async (minutes: number) => {
    const r = await pomodoroStore.start({ habitId, minutes, topic: null, day: today?.today ?? "", zone: today?.timeZone ?? "" });
    setError(r.ok ? null : r.error);
    refresh();
  };
  const cancel = async () => {
    await pomodoroStore.cancel();
    refresh();
  };
  const save = async () => {
    const r = await pomodoroStore.finish();
    refresh();
    if (!r.ok) return setError(r.error);
    track.creditBlock(r.block);
    router.back();
  };
  return <PomodoroPanel row={row} view={mine} error={error} onStart={start} onCancel={cancel} onSave={save} onBack={() => router.back()} />;
}
