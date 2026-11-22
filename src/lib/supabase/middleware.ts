import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { shouldSignOut } from "./profile-gate";
import { isPublicPath, safeNextPath } from "./public-paths";

const AUTH_PAGES = ["/bienvenida", "/login", "/registro"];

function redirectTo(
  request: NextRequest,
  path: string,
  from: NextResponse,
  search = "",
) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = search;
  const res = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}

function nextQuery(next: string) {
  return next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
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
  const isAuthPage = AUTH_PAGES.includes(path);
  const isInvite = path.startsWith("/invite/");

  if (!user) {
    if (path === "/") return redirectTo(request, "/bienvenida", response);
    if (isInvite) {
      return redirectTo(request, "/login", response, nextQuery(safeNextPath(path)));
    }
    if (isPublic) return response;
    return redirectTo(request, "/login", response, nextQuery(safeNextPath(path)));
  }

  // Signed in: public pages other than the auth pages and invites need no profile.
  if (isPublic && !isAuthPage && !isInvite) return response;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  // A failed query (outage, timeout) must not log the user out: let the request through.
  if (profileError) return response;
  if (shouldSignOut({ data: profile, error: profileError })) {
    await supabase.auth.signOut();
    return redirectTo(request, "/login", response, "?error=perfil");
  }
  if (isAuthPage) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return redirectTo(request, next, response);
  }
  return response;
}
