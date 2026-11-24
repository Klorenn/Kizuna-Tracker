import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import type { WidgetResult } from "@/lib/widget-api";

/** The widget bodies are tiny (a code, a token, an id). */
const MAX_BODY = 4096;

/** JSON answer with no caching anywhere; Retry-After on a 429; revalidation only if the result asks for it (a success). */
export function respond(r: WidgetResult): NextResponse {
  for (const path of r.revalidate ?? []) revalidatePath(path);
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (r.retryAfter !== undefined) headers["Retry-After"] = String(r.retryAfter);
  return NextResponse.json(r.body, { status: r.status, headers });
}

/** The request's JSON body, or null when it is missing, not JSON or over 4 KB. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
