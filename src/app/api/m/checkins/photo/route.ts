import { NextResponse } from "next/server";
import { requireUser } from "@/lib/mobile-auth";
import { handlePhotoRequest } from "@/lib/photo-checkin-api";
import { supabaseDeps } from "@/lib/photo-checkin-deps";
import { verifyJwt } from "@/lib/supabase/bearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Native photo check-in: the same handler and codes as the web route, authenticated by the bearer JWT (never a body user id). */
export async function POST(request: Request) {
  const result = await handlePhotoRequest({
    request,
    authenticate: async () => {
      const auth = await requireUser(request.headers, { verify: verifyJwt });
      return auth.ok ? auth.userId : null;
    },
    deps: supabaseDeps(),
    now: new Date(),
  });
  return NextResponse.json(result, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
