import { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { registerTrackingMutations } from "./mutations";

/** How long a persisted cache / paused tap is kept: one day (a tap older than its local day is dropped anyway). */
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

export type QueryClientDeps = { client: () => SupabaseClient<Database>; reportError: (message: string) => void };

/** The app's QueryClient with every tracking mutation default registered (before any provider mounts). */
export function createQueryClient(deps: QueryClientDeps): QueryClient {
  const qc = new QueryClient({
    defaultOptions: {
      // serve the cache first and try the network after: Hoy renders offline, a tap is attempted and, if the network is
      // down, waits (paused) to be replayed. gcTime matches the persister's maxAge or the restored cache would be collected.
      queries: { networkMode: "offlineFirst", gcTime: CACHE_MAX_AGE },
      mutations: { networkMode: "offlineFirst", gcTime: CACHE_MAX_AGE },
    },
  });
  registerTrackingMutations(qc, deps);
  return qc;
}
