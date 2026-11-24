import { clientIp, ipBucket } from "@/lib/request-ip";
import { widgetToday } from "@/lib/widget-api";
import { supabaseWidgetDeps } from "@/lib/widget-deps";
import { respond } from "@/lib/widget-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Today's pending habits for the widget. Bearer token (kzw_...), no cookie. */
export async function GET(request: Request) {
  const ipKey = `wauth:addr:${ipBucket(clientIp(request.headers))}`;
  return respond(await widgetToday(supabaseWidgetDeps(), { authorization: request.headers.get("authorization"), ipKey }));
}
