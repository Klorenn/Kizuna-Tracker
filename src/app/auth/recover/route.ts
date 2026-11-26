import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/site-url";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Exchanges the recovery link for a session, then opens the new-password screen. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createServerClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    ok = !error;
  }
  const next = ok ? "/recuperar/nueva" : "/recuperar?error=enlace";
  return NextResponse.redirect(new URL(next, siteOrigin(request.headers)), {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
