import { clientIp, ipBucket } from "@/lib/request-ip";
import { widgetPair } from "@/lib/widget-api";
import { supabaseWidgetDeps } from "@/lib/widget-deps";
import { readJson, respond } from "@/lib/widget-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Device pairing: a one-time code for a long-lived widget token. Public path: the code is the credential. */
export async function POST(request: Request) {
  // Only a JSON body: a hostile page can fire a cross-site text/plain or form POST without a preflight, and every
  // failed guess counts against the victim's address bucket. Refuse before touching the limiter.
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") return respond({ status: 415, body: { error: "unsupported_media_type" } });
  const ipKey = `wpair:addr:${ipBucket(clientIp(request.headers))}`;
  return respond(await widgetPair(supabaseWidgetDeps(), { body: await readJson(request), ipKey }));
}
