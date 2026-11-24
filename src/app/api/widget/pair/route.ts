import { clientIp, ipBucket } from "@/lib/request-ip";
import { widgetPair } from "@/lib/widget-api";
import { supabaseWidgetDeps } from "@/lib/widget-deps";
import { readJson, respond } from "@/lib/widget-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Device pairing: a one-time code for a long-lived widget token. Public path: the code is the credential. */
export async function POST(request: Request) {
  const ipKey = `wpair:addr:${ipBucket(clientIp(request.headers))}`;
  return respond(await widgetPair(supabaseWidgetDeps(), { body: await readJson(request), ipKey }));
}
