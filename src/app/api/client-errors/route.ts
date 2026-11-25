import { after } from "next/server";
import { ingestClientError, type IngestDeps } from "@/lib/client-errors/ingest";
import { readBodyCapped } from "@/lib/client-errors/body";
import { MAX_BODY_BYTES } from "@/lib/client-errors/payload";
import { clientIp, ipBucket } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CONTENT = () => new Response(null, { status: 204 });

/** The id of the cookie session, or null. Never taken from the body. getClaims verifies locally: no Auth round trip. */
async function sessionUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

function supabaseDeps(): IngestDeps {
  const db = createAdminClient();
  return {
    async limited({ key, limit, windowSeconds }) {
      const { data, error } = await db.rpc("rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds, p_record: true });
      if (error) throw new Error(error.message); // the limiter failed: ingest fails open
      return data === true;
    },
    async record(row) {
      const { error } = await db.rpc("record_client_error", {
        p_user_id: row.user_id as string,
        p_kind: row.kind,
        p_message: row.message,
        p_stack: row.stack as string,
        p_url_path: row.url_path,
        p_ua_kind: row.ua_kind,
        p_app_version: row.app_version as string,
        p_release: row.release as string,
        p_fingerprint: row.fingerprint,
      });
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Anonymous error reports from the web and the Android WebView. Always 204 and fast: the body is read here, the session is
 * resolved here, and the limiter + write run after the response. Nothing about the outcome is ever told to the caller.
 */
export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) return NO_CONTENT();
    // the stream is read here and abandoned after 8 KB: content-length can lie or be absent (chunked)
    const rawBody = await readBodyCapped(request.body, MAX_BODY_BYTES);
    if (rawBody === null) return NO_CONTENT();
    const userId = await sessionUserId();
    const input = {
      rawBody,
      // Assumes Vercel's edge: it sets x-vercel-forwarded-for / x-real-ip itself, so a client cannot choose its bucket.
      // Off Vercel these headers are client-controlled and the per-IP limit would be spoofable (the global cap still holds).
      ipBucket: ipBucket(clientIp(request.headers)),
      userId,
      ua: request.headers.get("user-agent"),
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    };
    after(async () => {
      try {
        await ingestClientError(supabaseDeps(), input);
      } catch {
        // ingest never throws; this covers a missing service-role configuration
      }
    });
  } catch {
    // always 204
  }
  return NO_CONTENT();
}
