import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideAccess, type AccessDecision } from "./access";
import type { Database } from "./database.types";
import { supabasePublicConfig, supabasePublicKey, supabaseUrl } from "./env";
import { shouldSignOut } from "./profile-gate";
import { isPublicPath, safeNextPath } from "./public-paths";

const FETCH_TIMEOUT_MS = 3000;
let warned = false; // log the configuration problem once per process, not per request

const AUTH_PAGES =["/bienvenida", "/login", "/registro"];

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

function applyDecision(
  request: NextRequest,
  decision: AccessDecision,
  response: NextResponse,
) {
  if (decision.kind === "redirect") {
    return redirectTo(request, decision.to, response, decision.search);
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const config = supabasePublicConfig();

  let supabase: ReturnType<typeof createServerClient<Database>> | null = null;
  if (config) {
    try {
      supabase = createServerClient<Database>(config.url, config.key, {
        global: {
          // A hanging Supabase must fail fast (counts as an auth failure), not 504.
          fetch: (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
        },
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
      });
    } catch {
      // e.g. a malformed URL: same as missing configuration.
      supabase = null;
    }
  }

  if (!supabase) {
    if (!warned) {
      warned = true;
      const missing = [!supabaseUrl() && "url", !supabasePublicKey() && "publicKey"].filter(Boolean);
      console.error(
        `[middleware] Supabase configuration missing or invalid: ${missing.join(", ") || "unusable value"}`,
      );
    }
    return applyDecision(
      request,
      decideAccess({ path, configPresent: false, user: null, authError: false }),
      response,
    );
  }

  let user: { id: string } | null = null;
  let authError = false;
  try {
    const res = await supabase.auth.getUser();
    user = res.data.user;
  } catch {
    // Network failure or Supabase down: signed-out rules, cookies untouched.
    authError = true;
  }

  const decision = decideAccess({ path, configPresent: true, user, authError });
  if (decision.kind !== "continue" || !user) {
    return applyDecision(request, decision, response);
  }

  const isPublic = isPublicPath(path);
  const isAuthPage = AUTH_PAGES.includes(path);
  const isInvite = path.startsWith("/invite/");

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
