import { requireUser } from "@/lib/mobile-auth";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyJwt } from "@/lib/supabase/bearer";
import { webSession } from "@/lib/web-session-api";
import { readJson, respond } from "@/lib/widget-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One-time URL that signs the app's WebView into the web as the verified user (see /auth/native-handoff). */
export async function POST(request: Request) {
  const auth = await requireUser(request.headers, { verify: verifyJwt });
  if (!auth.ok) return respond({ status: 401, body: { ok: false, error: "unauthorized" } });
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") return respond({ status: 415, body: { ok: false, error: "unsupported_media_type" } });
  const admin = createAdminClient();
  return respond(
    await webSession(
      { body: await readJson(request), userId: auth.userId, origin: siteOrigin(request.headers) },
      {
        async registerAttempt(key) {
          const { data, error } = await admin.rpc("register_login_attempt", { p_keys: [key] });
          return !error && data === true; // fail closed
        },
        async hashedTokenFor(userId) {
          const { data: found, error } = await admin.auth.admin.getUserById(userId);
          const email = error ? null : found.user?.email;
          if (!email) return null;
          const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
          return linkError ? null : (data.properties?.hashed_token ?? null);
        },
      },
    ),
  );
}
