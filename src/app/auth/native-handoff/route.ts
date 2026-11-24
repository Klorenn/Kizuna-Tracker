import { NextResponse } from "next/server";
import { isNativeRequest } from "@/lib/native-shell";
import { nativeHandoff } from "@/lib/native-handoff";
import { siteOrigin } from "@/lib/site-url";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Opened by the native app's WebView with a one-time token_hash. The cookie client verifies it (that sets the session
 * cookies) and the user lands on `next`. The token is in the URL, so no caching and no Referer leave this response.
 */
export async function GET(request: Request) {
  // Login CSRF guard: only the app's WebView (UA marker + the header it adds to its first load) may open this.
  if (!isNativeRequest(request.headers)) return new NextResponse(null, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const url = new URL(request.url);
  const supabase = await createServerClient();
  const location = await nativeHandoff(
    { tokenHash: url.searchParams.get("token_hash"), next: url.searchParams.get("next") },
    {
      async verify(tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
        return !error;
      },
    },
  );
  return NextResponse.redirect(new URL(location, siteOrigin(request.headers)), {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
