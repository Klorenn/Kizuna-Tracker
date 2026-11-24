import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../src/auth/session";
import { selectToday } from "../../../src/data/today";
import { useTrack } from "../../../src/data/use-track";
import { HabitDetail } from "../../../src/today/HabitDetail";
import type { TodayRaw } from "../../../src/data/today";

/** habitos/[id]: reads the cached Hoy (no extra request) and offers the same taps. */
export default function HabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const userId = useSession().session?.user.id ?? "";
  const q = useQuery<TodayRaw, Error, ReturnType<typeof selectToday>>({
    queryKey: ["today", userId],
    enabled: false,
    select: (raw) => selectToday(raw),
  });
  const track = useTrack(userId, q.data);
  const row = q.data?.rows.find((r) => r.id === id) ?? null;
  return <HabitDetail row={row} actions={{ onCheck: track.check, onUndo: track.undo, onItem: track.toggleItem, onNavigate: (path) => router.push(path as never) }} onBack={() => router.back()} />;
}
