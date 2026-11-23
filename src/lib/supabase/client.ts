import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabasePublicConfig } from "./env";

/** Throws a clear error when the public configuration is missing; callers must catch. */
export function createBrowserClient() {
  const config = supabasePublicConfig();
  if (!config) throw new Error("Supabase public configuration is missing");
  return createSsrBrowserClient<Database>(config.url, config.key);
}
