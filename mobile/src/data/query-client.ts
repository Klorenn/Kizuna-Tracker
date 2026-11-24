import { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { registerTrackingMutations } from "./mutations";

export type QueryClientDeps = { client: () => SupabaseClient<Database>; reportError: (message: string) => void };

/** The app's QueryClient with every tracking mutation default registered (before any provider mounts). */
export function createQueryClient(deps: QueryClientDeps): QueryClient {
  const qc = new QueryClient();
  registerTrackingMutations(qc, deps);
  return qc;
}
