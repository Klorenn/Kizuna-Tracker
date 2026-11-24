import { useRouter } from "expo-router";
import { useSession } from "../../src/auth/session";
import { supabase } from "../../src/lib/supabase";
import { HoyContainer } from "../../src/today/HoyContainer";

/** Hoy: the shared reads, optimistic taps (boolean, steps, undo) and the rest opens the habit page. */
export default function Hoy() {
  const { session } = useSession();
  const router = useRouter();
  return <HoyContainer userId={session?.user.id ?? ""} client={supabase} onOpenHabit={(id) => router.push(`/habitos/${id}`)} />;
}
