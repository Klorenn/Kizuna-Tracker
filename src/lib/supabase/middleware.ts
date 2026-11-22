import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { isPublicPath, safeNextPath } from "./public-paths";

function redirectTo(
  request: NextRequest,
  path: string,
  from: NextResponse,
  next?: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = next ? `?next=${encodeURIComponent(next)}` : "";
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
  const isPublic = isPublicPath(path);

  if (!user) {
    if (path.startsWith("/invite/")) {
      return redirectTo(request, "/login", response, path);
    }
    if (isPublic) return response;
    return redirectTo(request, "/login", response);
  }
  if (isPublic && path !== "/login" && !path.startsWith("/invite/")) {
    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!profile && path !== "/onboarding") {
    const next = safeNextPath(path);
    return redirectTo(
      request,
      "/onboarding",
      response,
      next === "/" ? undefined : next,
    );
  }
  if (profile && (path === "/onboarding" || path === "/login")) {
    return redirectTo(request, "/", response);
  }
  return response;
}
