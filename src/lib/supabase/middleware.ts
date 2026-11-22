import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

const PUBLIC_PREFIXES = ["/login", "/auth"];

function redirectTo(request: NextRequest, path: string, from: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  const res = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (!user) {
    return isPublic ? response : redirectTo(request, "/login", response);
  }
  if (path.startsWith("/auth")) return response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!profile && path !== "/onboarding") {
    return redirectTo(request, "/onboarding", response);
  }
  if (profile && (path === "/onboarding" || path === "/login")) {
    return redirectTo(request, "/", response);
  }
  return response;
}
