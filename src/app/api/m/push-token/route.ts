import { removePushToken, registerPushToken, type PushTokenDeps } from "@/lib/push-token-api";
import { requireUser } from "@/lib/mobile-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyJwt } from "@/lib/supabase/bearer";
import { readJson, respond } from "@/lib/widget-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** service_role writes: an owner could not move a token that belongs to another account under RLS. */
function adminDeps(): PushTokenDeps {
  const db = createAdminClient();
  return {
    async upsertToken(userId, token) {
      const { error } = await db
        .from("device_push_tokens")
        .upsert({ user_id: userId, token, last_seen_at: new Date().toISOString() }, { onConflict: "token" });
      if (error) throw error;
    },
    async deleteToken(userId, token) {
      const { error } = await db.from("device_push_tokens").delete().eq("user_id", userId).eq("token", token);
      if (error) throw error;
    },
  };
}

async function handle(request: Request, run: typeof registerPushToken) {
  const auth = await requireUser(request.headers, { verify: verifyJwt });
  if (!auth.ok) return respond({ status: 401, body: { ok: false, error: "unauthorized" } });
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") return respond({ status: 415, body: { ok: false, error: "unsupported_media_type" } });
  return respond(await run({ body: await readJson(request), userId: auth.userId }, adminDeps()));
}

/** Registers (or re-registers) this device's Expo push token for the verified user. */
export const POST = (request: Request) => handle(request, registerPushToken);
/** Unregisters it (logout). Only the caller's own row can be removed. */
export const DELETE = (request: Request) => handle(request, removePushToken);
