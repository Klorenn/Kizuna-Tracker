import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideAccess, type AccessDecision } from "./access";
import type { Database } from "./database.types";
import { supabasePublicConfig, supabasePublicKey, supabaseUrl } from "./env";
import { shouldSignOut } from "./profile-gate";
import { isGroupInvitePath, isPublicPath, safeNextPath } from "./public-paths";

/*
 * Time budgets (a hanging Supabase must not become a 504, and a slow one must not log anyone out):
 *  - REST (the profile query): 3 s, no retries.
 *  - Auth calls (/auth/v1/user, JWKS, logout): 5 s. With the legacy HS256 secret every request
 *    asks /auth/v1/user, so this is the latency Auth may have before protected pages answer 503.
 *  - /auth/v1/token: 10 s per attempt, not the short budget: a slow refresh should get time to
 *    answer. The 12 s deadline below still wins over everything, so a refresh (or a retry of it)
 *    can be aborted mid-flight when the deadline fires; that risks one lost rotation and is
 *    answered with a 503, never a sign-out.
 *  - The whole middleware: 12 s, then everything in flight is aborted.
 * Worst-case wall time per scenario:
 *  - signed out, no cookies: no network call, instant.
 *  - valid HS256 session: /user <= 5 s + profile <= 3 s = 8 s.
 *  - valid asymmetric session: JWKS <= 5 s (cold isolate only) + profile <= 3 s = 8 s.
 *  - expired token, refresh slow but answering: /token <= 10 s + /user <= 5 s = 15 s, cut at the
 *    12 s deadline (503 with whatever cookies were already set).
 *  - Auth down with an expired token: auth-js keeps retrying the refresh (0.2, 0.4, 0.8 ... s);
 *    the 12 s deadline ends it with a 503.
 */
export const FETCH_TIMEOUT_MS = 3000;
export const AUTH_TIMEOUT_MS = 5000;
export const TOKEN_TIMEOUT_MS = 10_000;
/** The whole middleware: after this the answer is a 503 (session cookies) or the signed-out rules. */
export const DEADLINE_MS = 12_000;

let warned = false; // log the configuration problem once per process, not per request

const AUTH_PAGES = ["/bienvenida", "/login", "/registro"];

export function timeoutFor(input: RequestInfo | URL): number {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let pathname: string;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    return FETCH_TIMEOUT_MS;
  }
  if (pathname === "/auth/v1/token") return TOKEN_TIMEOUT_MS;
  if (pathname.startsWith("/auth/v1/")) return AUTH_TIMEOUT_MS;
  return FETCH_TIMEOUT_MS;
}

/** Aborts when any of the signals does (AbortSignal.any where the runtime has it). */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const c = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      c.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => c.abort(s.reason), { once: true });
  }
  return c.signal;
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

/**
 * Lightweight "try again" answer: the person stays signed in (no redirect, no sign-out). It still
 * carries the cookies the Supabase client set during this request, so a refresh that already
 * succeeded is not lost (the next try would rotate the refresh token again).
 */
function retryResponse(from: NextResponse) {
  const res = new NextResponse(RETRY_PAGE, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "2",
      "cache-control": "no-store",
    },
  });
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
  if (decision.kind === "unavailable") return retryResponse(response);
  return response;
}

/**
 * Auth could not answer. auth-js wraps every real network failure, timeout and 5xx as
 * AuthRetryableFetchError; a raw TypeError or the like is bad data (a malformed cookie), which
 * is "signed out", not an outage.
 */
function isTransient(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { name, status } = e as { name?: string; status?: number };
  if (name === "AuthRetryableFetchError") return true;
  // 429: Auth is rate-limiting us, a slow service, not an answer about this session
  return typeof status === "number" && (status >= 500 || status === 429);
}

/** The session cookie by name, chunks (.0, .1 ...) included; not the PKCE code verifier. */
export function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-[^.]+-auth-token(\.\d+)?$/.test(c.name));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // Shared with run(): setAll replaces .response, so the deadline path always sees the latest cookies.
  const state = { response: NextResponse.next({ request }) };
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => resolve("deadline"), DEADLINE_MS);
  });
  try {
    const work = run(request, state, abort.signal);
    work.catch(() => {}); // after the deadline nobody awaits it
    const result = await Promise.race([work, deadline]);
    if (result !== "deadline") return result;
    abort.abort(new DOMException("middleware deadline", "TimeoutError"));
    return applyDecision(
      request,
      decideAccess({
        path: request.nextUrl.pathname,
        configPresent: true,
        user: null,
        authError: true,
        // someone with a session is not "signed out" just because Supabase was slow
        unavailable: hasSessionCookie(request),
      }),
      state.response,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function run(
  request: NextRequest,
  state: { response: NextResponse },
  deadlineSignal: AbortSignal,
): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const config = supabasePublicConfig();

  let supabase: ReturnType<typeof createServerClient<Database>> | null = null;
  if (config) {
    try {
      supabase = createServerClient<Database>(config.url, config.key, {
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: anySignal([AbortSignal.timeout(timeoutFor(input)), deadlineSignal]),
            }),
        },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(list) {
            list.forEach(({ name, value }) => request.cookies.set(name, value));
            state.response = NextResponse.next({ request });
            list.forEach(({ name, value, options }) =>
              state.response.cookies.set(name, value, options),
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
      state.response,
    );
  }

  // getClaims verifies the JWT locally against the cached JWKS (asymmetric keys; with the legacy
  // HS256 secret it makes the same /auth/v1/user call getUser() made) and refreshes an expired
  // session through the cookie adapter above. auth-js rethrows what is not an AuthError (a
  // malformed token, an unknown alg): none of it may become a 500.
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
    // Signed-out rules, cookies untouched. Only a real outage with a session is "try again".
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
    return applyDecision(request, decision, state.response);
  }

  const isPublic = isPublicPath(path);
  const isAuthPage = AUTH_PAGES.includes(path);
  const isInvite = path.startsWith("/invite/") || isGroupInvitePath(path);

  // Signed in: public pages other than the auth pages and invites need no profile.
  if (isPublic && !isAuthPage && !isInvite) return state.response;

  // No automatic retries here: a slow database must cost one 3 s attempt, not several.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .is("deleted_at", null)
    .retry(false)
    .maybeSingle();

  // A failed query (outage, timeout) must not log the user out: let the request through.
  if (profileError) return state.response;
  if (shouldSignOut({ data: profile, error: profileError })) {
    await supabase.auth.signOut();
    return redirectTo(request, "/login", state.response, "?error=perfil");
  }
  if (isAuthPage) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return redirectTo(request, next, state.response);
  }
  return state.response;
}
