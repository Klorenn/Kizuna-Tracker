import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideAccess, type AccessDecision } from "./access";
import type { Database } from "./database.types";
import { supabasePublicConfig, supabasePublicKey, supabaseUrl } from "./env";
import { shouldSignOut } from "./profile-gate";
import { isPublicPath, safeNextPath } from "./public-paths";

/** Every auth and REST call fails fast: a hanging Supabase must not become a 504. */
export const FETCH_TIMEOUT_MS = 3000;
/**
 * The token endpoint rotates the refresh token: aborting it mid-flight can sign the person out
 * for good, so it gets a long timeout instead of the short one.
 */
export const TOKEN_TIMEOUT_MS = 10_000;
/** The whole middleware: after this the signed-out rules apply, with cookies untouched. */
export const DEADLINE_MS = 12_000;

let warned = false; // log the configuration problem once per process, not per request

const AUTH_PAGES = ["/bienvenida", "/login", "/registro"];

export function timeoutFor(input: RequestInfo | URL): number {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return url.includes("/auth/v1/token") ? TOKEN_TIMEOUT_MS : FETCH_TIMEOUT_MS;
}

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

const RETRY_PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Kizuna</title></head><body style="margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:0 20px;text-align:center;font-family:system-ui,sans-serif"><p style="max-width:28rem;margin:0">Algo salió mal. Inténtalo de nuevo en unos minutos.</p><a href="" style="text-decoration:underline">Reintentar</a></body></html>`;

/** Lightweight "try again" answer: the person stays signed in (no redirect, no cookie changes). */
function retryResponse() {
  return new NextResponse(RETRY_PAGE, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "2",
      "cache-control": "no-store",
    },
  });
}

function applyDecision(
  request: NextRequest,
  decision: AccessDecision,
  response: NextResponse,
) {
  if (decision.kind === "redirect") {
    return redirectTo(request, decision.to, response, decision.search);
  }
  if (decision.kind === "unavailable") return retryResponse();
  return response;
}

/** Auth could not answer (network, timeout, 5xx), as opposed to answering "no". */
function isTransient(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { name, status } = e as { name?: string; status?: number };
  if (name === "AbortError" || name === "TimeoutError" || name === "TypeError") return true;
  if (name === "AuthRetryableFetchError") return true;
  return typeof status === "number" && (status === 0 || status >= 500);
}

const hasSessionCookie = (request: NextRequest) =>
  request.cookies.getAll().some((c) => /^sb-.+-auth-token/.test(c.name));

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => resolve("deadline"), DEADLINE_MS);
  });
  try {
    const result = await Promise.race([run(request), deadline]);
    if (result !== "deadline") return result;
    // Too slow: signed-out rules on a clean response, so no half-written cookies leak out.
    return applyDecision(
      request,
      decideAccess({ path: request.nextUrl.pathname, configPresent: true, user: null, authError: true }),
      NextResponse.next({ request }),
    );
  } finally {
    clearTimeout(timer);
  }
}

async function run(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const config = supabasePublicConfig();

  let supabase: ReturnType<typeof createServerClient<Database>> | null = null;
  if (config) {
    try {
      supabase = createServerClient<Database>(config.url, config.key, {
        global: {
          fetch: (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(timeoutFor(input)) }),
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

  // getClaims verifies the JWT locally against the cached JWKS (asymmetric keys; with the legacy
  // HS256 secret it makes the same /auth/v1/user call getUser() made) and refreshes an expired
  // session through the cookie adapter above. auth-js rethrows what is not an AuthError (a
  // malformed token, an unknown alg, a network failure): none of it may become a 500.
  let user: { id: string } | null = null;
  let authError = false;
  let unavailable = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (sub) user = { id: sub };
    else if (error) {
      authError = true;
      unavailable = hasSessionCookie(request) && isTransient(error);
    }
  } catch (e) {
    // Signed-out rules, cookies untouched. A network failure while a session exists is not
    // "signed out": answer "try again" instead of bouncing the person to /login.
    authError = true;
    unavailable = hasSessionCookie(request) && isTransient(e);
  }

  const decision = decideAccess({
    path,
    configPresent: true,
    user,
    authError,
    unavailable,
  });
  if (decision.kind !== "continue" || !user) {
    return applyDecision(request, decision, response);
  }

  const isPublic = isPublicPath(path);
  const isAuthPage = AUTH_PAGES.includes(path);
  const isInvite = path.startsWith("/invite/");

  // Signed in: public pages other than the auth pages and invites need no profile.
  if (isPublic && !isAuthPage && !isInvite) return response;

  // No automatic retries here: a slow database must cost one 3 s attempt, not several.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .is("deleted_at", null)
    .retry(false)
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
