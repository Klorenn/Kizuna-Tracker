import { createClient } from "@supabase/supabase-js";
import { loginDeps } from "@/lib/login-deps";
import { mobileLogin } from "@/lib/mobile-login-api";
import { clientIp } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { supabasePublicConfig } from "@/lib/supabase/env";
import { readJson, respond } from "@/lib/widget-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Native login: same `loginWith` and limiter as the web action, but returns the session instead of setting cookies. */
export async function POST(request: Request) {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") return respond({ status: 415, body: { ok: false, error: "unsupported_media_type" } });
  const config = supabasePublicConfig();
  if (!config) return respond({ status: 503, body: { ok: false, error: "unavailable" } });
  const ip = clientIp(request.headers);
  const admin = createAdminClient();
  const anon = createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return respond(
    await mobileLogin({ body: await readJson(request), ip }, (capture) =>
      loginDeps(
        admin,
        async (email, password) => {
          const { data, error } = await anon.auth.signInWithPassword({ email, password });
          if (error || !data.session) return { ok: false };
          const { access_token, refresh_token, expires_at } = data.session;
          capture({ access_token, refresh_token, expires_at: expires_at ?? 0 });
          return { ok: true };
        },
        ip,
      ),
    ),
  );
}
