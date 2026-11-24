import { useRouter } from "expo-router";
import { useSession } from "../../src/auth/session";
import { useCachedToday } from "../../src/data/use-cached-today";
import { supabase } from "../../src/lib/supabase";
import { useReconcilePomodoroBlocks } from "../../src/pomodoro/use-reconcile-blocks";
import { HoyContainer } from "../../src/today/HoyContainer";

/** Hoy: the shared reads, optimistic taps (boolean, steps, quantity, undo) and the rest opens the habit page. */
export default function Hoy() {
  const { session } = useSession();
  const router = useRouter();
  const userId = session?.user.id ?? "";
  const { view } = useCachedToday();
  // Pomodoro blocks that finished while the app was killed are credited when Hoy opens
  useReconcilePomodoroBlocks({ userId, client: supabase, timeZone: view?.timeZone });
  return <HoyContainer userId={userId} client={supabase} onOpenHabit={(id) => router.push(`/habitos/${id}`)} onNavigate={(path) => router.push(path as never)} />;
}
