import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabasePublicConfig } from "@/lib/supabase/env";
import { configPresence } from "@/lib/supabase/env.server";

export const dynamic = "force-dynamic";

async function schemaReachable(): Promise<boolean> {
  const config = supabasePublicConfig();
  if (!config) return false;
  try {
    const client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error, status } = await client
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .abortSignal(AbortSignal.timeout(3000));
    if (!error) return true;
    // Table missing: not found / undefined relation.
    if (error.code === "PGRST205" || error.code === "42P01" || status === 404) return false;
    // Permission or RLS answer: the table exists, the anon role just cannot read it.
    return status === 401 || status === 403 || error.code === "42501";
  } catch {
    return false;
  }
}

/** Public liveness/config check. Booleans only: no values, hosts or error text. */
export async function GET() {
  const config = configPresence();
  const schema = await schemaReachable();
  const ok = config.url && config.publicKey && config.serviceKey && schema;
  return NextResponse.json(
    { ok, config, schema },
    { headers: { "Cache-Control": "no-store" } },
  );
}
