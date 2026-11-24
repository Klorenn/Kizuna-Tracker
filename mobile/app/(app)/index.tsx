import NetInfo from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSession } from "../../src/auth/session";
import { fetchToday, selectToday } from "../../src/data/today";
import { supabase } from "../../src/lib/supabase";
import { HoyView, type HoyState } from "../../src/today/HoyView";

/** Read-only Hoy: the shared reads and `buildToday`; the cached value shows first when offline. */
export default function Hoy() {
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);

  const q = useQuery({
    queryKey: ["today", userId],
    queryFn: () => fetchToday(supabase(), userId),
    enabled: userId !== "",
    select: (raw) => selectToday(raw),
  });

  const state: HoyState = q.data ? { kind: "ready", view: q.data } : q.isError ? { kind: "error", offline } : { kind: "loading" };
  return <HoyView state={state} onRetry={() => void q.refetch()} />;
}
