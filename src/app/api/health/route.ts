import { NextResponse } from "next/server";
import { supabasePublicConfig } from "@/lib/supabase/env";
import { configPresence } from "@/lib/supabase/env.server";

export const dynamic = "force-dynamic";

/**
 * Does the `profiles` table exist? Raw GET with limit=0 (no postgrest-js: it rewrites an
 * empty-body 404 into "no error" and retries network failures). The anon role has no
 * grant on profiles, so an existing table answers 401/42501 and a missing one 404/PGRST205.
 */
async function schemaReachable(): Promise<boolean> {
  const config = supabasePublicConfig();
  if (!config) return false;
  try {
    const res = await fetch(
      `${config.url.replace(/\/+$/, "")}/rest/v1/profiles?select=id&limit=0`,
      {
        method: "GET",
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (res.ok) return true;
    let code = "";
    try {
      code = String(((await res.json()) as { code?: unknown }).code ?? "");
    } catch {
      // empty or non-JSON body
    }
    if (code === "PGRST205" || code === "42P01" || res.status === 404) return false;
    return code === "42501" || res.status === 401 || res.status === 403;
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
