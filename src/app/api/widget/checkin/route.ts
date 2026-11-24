import { clientIp, ipBucket } from "@/lib/request-ip";
import { widgetCheckin } from "@/lib/widget-api";
import { supabaseWidgetDeps } from "@/lib/widget-deps";
import { readJson, respond } from "@/lib/widget-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Checks a plain boolean habit in for the token's user. Bearer token (kzw_...), no cookie. */
export async function POST(request: Request) {
  const ipKey = `wauth:addr:${ipBucket(clientIp(request.headers))}`;
  return respond(
    await widgetCheckin(supabaseWidgetDeps(), {
      authorization: request.headers.get("authorization"),
      ipKey,
      body: await readJson(request),
    }),
  );
}
