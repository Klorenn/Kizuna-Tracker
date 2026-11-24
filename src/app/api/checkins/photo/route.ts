import { NextResponse } from "next/server";
import { handlePhotoRequest } from "@/lib/photo-checkin-api";
import { supabaseDeps } from "@/lib/photo-checkin-deps";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await handlePhotoRequest({
    request,
    authenticate: async () => {
      const supabase = await createServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
    deps: supabaseDeps(),
    now: new Date(),
  });
  return NextResponse.json(result, { status: result.status });
}
