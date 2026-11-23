import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseUrl } from "./env";
import { supabaseServiceKey } from "./env.server";

/** Service role: bypasses RLS. Server only; never import from client code. */
export function createAdminClient() {
  const url = supabaseUrl();
  const serviceKey = supabaseServiceKey();
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing");
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
