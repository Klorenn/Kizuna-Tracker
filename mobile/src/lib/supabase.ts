import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import type { Database } from "@/lib/supabase/database.types";
import { authStorage } from "./auth-storage";
import { env } from "./env";
import type { LargeSecureStore } from "./large-secure-store";

type Factory = typeof createClient;

/** Builds the app client: session in encrypted storage, refreshed automatically, never read from a URL. */
export function createAppSupabase(
  config: { supabaseUrl: string; supabaseAnonKey: string },
  storage: LargeSecureStore,
  factory: Factory = createClient,
): SupabaseClient<Database> {
  return factory<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  }) as unknown as SupabaseClient<Database>;
}

let client: SupabaseClient<Database> | null = null;

export function supabase(): SupabaseClient<Database> {
  if (!client) {
    client = createAppSupabase(env(), authStorage);
    // Auto-refresh only while the app is in the foreground (timers do not run reliably in the background).
    AppState.addEventListener("change", (state) => {
      if (state === "active") void client?.auth.startAutoRefresh();
      else void client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
