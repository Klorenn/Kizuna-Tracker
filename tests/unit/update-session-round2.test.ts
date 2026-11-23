import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_OK = "https://abc.supabase.co";
const ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
];
function setEnv() {
  for (const n of ENV_NAMES) vi.stubEnv(n, "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_OK);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
}

const USER = {
  id: "11111111-1111-1111-1111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "a@b.co",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = () => Math.floor(Date.now() / 1000);
const claims = (exp: number) => ({
  sub: USER.id,
  aud: "authenticated",
  role: "authenticated",
  email: USER.email,
  session_id: "s1",
  iat: exp - 3600,
  exp,
});
const hsToken = (exp: number) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims(exp))}.sig`;

function sessionJson(accessToken: string, expiresAt: number) {
  return JSON.stringify({
    access_token: accessToken,
    refresh_token: "rt",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: USER,
  });
}
const cookieFor = (accessToken: string, expiresAt: number) =>
  `sb-abc-auth-token=base64-${Buffer.from(sessionJson(accessToken, expiresAt)).toString("base64url")}`;
const freshCookie = () => cookieFor(hsToken(nowSec() + 3600), nowSec() + 3600);
const expiredCookie = () => cookieFor(hsToken(nowSec() - 60), nowSec() - 60);

function req(path: string, cookie?: string) {
  return new NextRequest(`https://app.test${path}`, { headers: cookie ? { cookie } : {} });
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const urlOf = (u: unknown) => String(u);
const refreshedSession = () => ({
  access_token: hsToken(nowSec() + 3600),
  refresh_token: "rt2",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec() + 3600,
  user: USER,
});
const hasAuthCookie = (res: Response) => (res.headers.get("set-cookie") ?? "").includes("sb-abc-auth-token");
const location = (res: Response) => {
  const l = res.headers.get("location");
  return l ? new URL(l).pathname : null;
};
const loggedOut = (f: { mock: { calls: unknown[][] } }) => f.mock.calls.some(([u]) => urlOf(u).includes("/logout"));

async function run(request: NextRequest) {
  const { updateSession } = await import("@/lib/supabase/middleware");
  return updateSession(request);
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  setEnv();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("C-1: every response carries the cookies the client set during this request", () => {
  it("refresh succeeds, then the user call times out: the 503 carries the new tokens", async () => {
    const f = vi.fn(async (u: unknown) => {
      const url = urlOf(u);
      if (url.includes("/auth/v1/token")) return json(200, refreshedSession());
      throw new DOMException("timed out", "TimeoutError"); // /auth/v1/user
    });
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", expiredCookie()));
    expect(res.status).toBe(503);
    expect(hasAuthCookie(res)).toBe(true);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(loggedOut(f)).toBe(false);
  });

  it("refresh succeeds, then the deadline fires: the deadline answer carries the new tokens", async () => {
    vi.useFakeTimers();
    const f = vi.fn((u: unknown) => {
      if (urlOf(u).includes("/auth/v1/token")) return Promise.resolve(json(200, refreshedSession()));
      return new Promise<Response>(() => {}); // /auth/v1/user never answers
    });
    vi.stubGlobal("fetch", f);
    const p = run(req("/hoy", expiredCookie()));
    await vi.advanceTimersByTimeAsync(12_000);
    const res = await p;
    expect(res.status).toBe(503);
    expect(hasAuthCookie(res)).toBe(true);
    expect(loggedOut(f)).toBe(false);
  });

  it("a redirect after a refresh carries the new tokens (signed-in visitor on /login goes to /)", async () => {
    const f = vi.fn(async (u: unknown) => {
      const url = urlOf(u);
      if (url.includes("/auth/v1/token")) return json(200, refreshedSession());
      if (url.includes("/auth/v1/user")) return json(200, USER);
      if (url.includes("/rest/v1/profiles")) return json(200, { id: USER.id });
      return json(404, {});
    });
    vi.stubGlobal("fetch", f);
    const res = await run(req("/login", expiredCookie()));
    expect(location(res)).toBe("/");
    expect(hasAuthCookie(res)).toBe(true);
  });

  it("a refresh rejected with 400 redirects to /login and clears the session cookie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(400, { error: "invalid_grant", error_description: "Invalid Refresh Token" })));
    const res = await run(req("/hoy", expiredCookie()));
    expect(location(res)).toBe("/login");
    expect(res.status).not.toBe(503);
  });
});

describe("C-2: a malformed or forged cookie is signed out, never a 503", () => {
  const unsignedToken = (header: unknown, payload: unknown) => `${b64(header)}.${b64(payload)}.sig`;
  const exp = () => nowSec() + 3600;
  const cases: [string, () => string][] = [
    ["payload null", () => cookieFor(unsignedToken({ alg: "HS256", typ: "JWT" }, null), exp())],
    ["header null", () => cookieFor(unsignedToken(null, claims(exp())), exp())],
    ["payload not JSON", () => cookieFor(`${b64({ alg: "HS256" })}.bm90IGpzb24.sig`, exp())],
    ["wrong number of segments", () => cookieFor("only.two", exp())],
    ["access token not a string", () => cookieFor(12345 as unknown as string, exp())],
    ["unknown alg", () => cookieFor(unsignedToken({ alg: "XX999", typ: "JWT", kid: "k" }, claims(exp())), exp())],
  ];

  it.each(cases)("%s on a protected page goes to /login", async (_n, make) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { msg: "invalid JWT" })));
    const res = await run(req("/hoy", make()));
    expect(res.status).not.toBe(503);
    expect(location(res)).toBe("/login");
  });

  it.each(cases)("%s on / goes to /bienvenida", async (_n, make) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { msg: "invalid JWT" })));
    expect(location(await run(req("/", make())))).toBe("/bienvenida");
  });

  it("a token signed for another project (Auth answers 401) goes to /login", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { msg: "invalid JWT: signature" })));
    expect(location(await run(req("/hoy", freshCookie())))).toBe("/login");
  });
});

describe("I-1: the overall deadline", () => {
  it("with session cookies on a protected path it answers 503, keeps the cookies, never signs out", async () => {
    vi.useFakeTimers();
    const f = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", f);
    const p = run(req("/hoy", freshCookie()));
    await vi.advanceTimersByTimeAsync(12_000);
    const res = await p;
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("2");
    expect(res.headers.get("location")).toBeNull();
    expect(loggedOut(f)).toBe(false);
  });

  it("without session cookies it applies the signed-out rules (/login), no network call was made", async () => {
    vi.useFakeTimers();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy"));
    expect(location(res)).toBe("/login");
    expect(f).not.toHaveBeenCalled();
  });

  it("aborts the fetches still in flight when it fires", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: unknown, init?: RequestInit) => {
        signals.push(init!.signal as AbortSignal);
        return new Promise<Response>(() => {});
      }),
    );
    const p = run(req("/hoy", freshCookie()));
    await vi.advanceTimersByTimeAsync(11_999);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => !s.aborted)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it("a token endpoint failing transiently with an expired cookie ends at the 503 deadline answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => json(503, { msg: "down" })));
    const p = run(req("/hoy", expiredCookie()));
    await vi.advanceTimersByTimeAsync(12_000);
    const res = await p;
    expect(res.status).toBe(503);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("I-2: budgets per endpoint", () => {
  it("token 10 s, /auth/v1/user 5 s, REST 3 s", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    const f = vi.fn(async (u: unknown) => {
      const url = urlOf(u);
      if (url.includes("/auth/v1/token")) return json(200, refreshedSession());
      if (url.includes("/auth/v1/user")) return json(200, USER);
      if (url.includes("/rest/v1/profiles")) return json(200, { id: USER.id });
      return json(404, {});
    });
    vi.stubGlobal("fetch", f);
    await run(req("/hoy", expiredCookie()));
    const used = spy.mock.calls.map((c) => c[0]);
    expect(used).toContain(10_000);
    expect(used).toContain(5000);
    expect(used).toContain(3000);
    expect(used).not.toContain(30_000);
  });
});

describe("timeoutFor and hasSessionCookie", () => {
  it("matches the token endpoint on the pathname only", async () => {
    const { timeoutFor } = await import("@/lib/supabase/middleware");
    expect(timeoutFor(`${URL_OK}/auth/v1/token?grant_type=refresh_token`)).toBe(10_000);
    expect(timeoutFor("https://auth.example.com/auth/v1/token?grant_type=refresh_token")).toBe(10_000);
    expect(timeoutFor(new URL(`${URL_OK}/auth/v1/token`))).toBe(10_000);
    expect(timeoutFor(new Request(`${URL_OK}/auth/v1/token`))).toBe(10_000);
    expect(timeoutFor(`${URL_OK}/auth/v1/user`)).toBe(5000);
    expect(timeoutFor(`${URL_OK}/auth/v1/.well-known/jwks.json`)).toBe(5000);
    expect(timeoutFor(`${URL_OK}/rest/v1/profiles?select=id`)).toBe(3000);
    // the substring in a query string or another path is not the token endpoint
    expect(timeoutFor(`${URL_OK}/rest/v1/profiles?x=/auth/v1/token`)).toBe(3000);
    expect(timeoutFor(`${URL_OK}/rest/v1/auth/v1/tokens`)).toBe(3000);
    expect(timeoutFor("not a url")).toBe(3000);
  });

  it("detects the session cookie by name, including chunks, and nothing else", async () => {
    const { hasSessionCookie } = await import("@/lib/supabase/middleware");
    const withCookie = (c: string) => req("/", c);
    expect(hasSessionCookie(withCookie("sb-abc-auth-token=x"))).toBe(true);
    expect(hasSessionCookie(withCookie("sb-abc-auth-token.0=x; sb-abc-auth-token.1=y"))).toBe(true);
    expect(hasSessionCookie(withCookie("sb-abc-auth-token-code-verifier=x"))).toBe(false);
    expect(hasSessionCookie(withCookie("theme=dark; other=1"))).toBe(false);
    expect(hasSessionCookie(withCookie("xsb-abc-auth-token=x"))).toBe(false);
    expect(hasSessionCookie(req("/"))).toBe(false);
  });

  it("a chunked session cookie still gets the 503 when auth cannot answer", async () => {
    const full = Buffer.from(sessionJson(hsToken(nowSec() + 3600), nowSec() + 3600)).toString("base64url");
    const mid = Math.floor(full.length / 2);
    const chunked = `sb-abc-auth-token.0=base64-${full.slice(0, mid)}; sb-abc-auth-token.1=${full.slice(mid)}`;
    vi.stubGlobal("fetch", vi.fn(async () => json(503, { msg: "down" })));
    expect((await run(req("/hoy", chunked))).status).toBe(503);
  });
});

describe("no path renders a protected page when the claims call fails", () => {
  const failures: [string, (u: string) => Promise<Response>][] = [
    ["a network error", async () => Promise.reject(new TypeError("fetch failed"))],
    ["a timeout", async () => Promise.reject(new DOMException("t", "TimeoutError"))],
    ["a 500", async () => json(500, {})],
    ["a 401", async () => json(401, {})],
    ["a 403", async () => json(403, {})],
    ["a 429 with no JSON", async () => new Response("slow down", { status: 429 })],
    ["a non-JSON 200", async () => new Response("<html>", { status: 200 })],
  ];
  it.each(failures)("%s: a redirect or a 503, never the page", async (_n, impl) => {
    vi.stubGlobal("fetch", vi.fn((u: unknown) => impl(urlOf(u))));
    for (const path of ["/hoy", "/", "/perfil/ajustes"]) {
      const res = await run(req(path, freshCookie()));
      const isRedirect = res.headers.get("location") !== null;
      expect(isRedirect || res.status === 503, `${path}: status ${res.status}`).toBe(true);
    }
  });
});
