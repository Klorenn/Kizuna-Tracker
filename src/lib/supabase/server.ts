import { createServerClient as createSsrClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { supabasePublicConfig } from "./env";

export async function createServerClient() {
  const config = supabasePublicConfig();
  if (!config) throw new Error("Supabase public configuration is missing");
  const cookieStore = await cookies();
  return createSsrClient<Database>(
    config.url,
    config.key,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component: middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
