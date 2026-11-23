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

function setEnv(env: Record<string, string>) {
  for (const n of ENV_NAMES) vi.stubEnv(n, "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}
const GOOD = { NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };

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
/** Legacy HS256 token: getClaims cannot verify it locally, so it asks /auth/v1/user (as getUser did). */
const hsToken = (exp: number) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims(exp))}.sig`;

function cookieFor(accessToken: string, expiresAt: number) {
  const session = {
    access_token: accessToken,
    refresh_token: "rt",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: USER,
  };
  return `sb-abc-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}
const freshCookie = () => cookieFor(hsToken(nowSec() + 3600), nowSec() + 3600);
const expiredCookie = () => cookieFor(hsToken(nowSec() - 60), nowSec() - 60);

function req(path: string, cookie?: string | boolean) {
  const c = cookie === true ? freshCookie() : cookie || undefined;
  return new NextRequest(`https://app.test${path}`, { headers: c ? { cookie: c } : {} });
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const urlOf = (u: unknown) => String(u);

async function run(request: NextRequest) {
  const { updateSession } = await import("@/lib/supabase/middleware");
  return updateSession(request);
}
function location(res: Response) {
  const l = res.headers.get("location");
  return l ? new URL(l).pathname : null;
}
const loggedOut = (f: { mock: { calls: unknown[][] } }) =>
  f.mock.calls.some(([u]) => urlOf(u).includes("/logout"));

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetModules();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("updateSession", () => {
  it("config missing: signed-out rules, one log per process, names only", async () => {
    setEnv({});
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(location(await run(req("/hoy")))).toBe("/login");
    expect(location(await run(req("/")))).toBe("/bienvenida");
    expect((await run(req("/login"))).headers.get("location")).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toMatch(/url, publicKey/);
  });

  it("malformed URL: treated as missing config, no throw", async () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    expect(location(await run(req("/hoy")))).toBe("/login");
    expect((await run(req("/login"))).headers.get("location")).toBeNull();
  });

  it("valid, signed out: protected goes to /login without calling Supabase", async () => {
    setEnv(GOOD);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(location(await run(req("/hoy")))).toBe("/login");
    expect(f).not.toHaveBeenCalled();
  });

  it("legacy HS256 token: getClaims asks /auth/v1/user, like getUser did, and the request passes", async () => {
    setEnv(GOOD);
    const f = vi.fn(async (u: unknown) => {
      const url = urlOf(u);
      if (url.includes("/auth/v1/user")) return json(200, USER);
      if (url.includes("/rest/v1/profiles")) return json(200, { id: USER.id });
      return json(404, {});
    });
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", true));
    expect(res.headers.get("location")).toBeNull();
    expect(f.mock.calls.filter(([u]) => urlOf(u).includes("/auth/v1/user"))).toHaveLength(1);
    expect(loggedOut(f)).toBe(false);
  });

  it("asymmetric (ES256) token: verified locally from the JWKS, no /auth/v1/user call", async () => {
    setEnv(GOOD);
    const { publicKey, privateKey } = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "ES256", use: "sig" };
    const exp = nowSec() + 3600;
    const signingInput = `${b64({ alg: "ES256", typ: "JWT", kid: "k1" })}.${b64(claims(exp))}`;
    const sig = Buffer.from(
      await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(signingInput)),
    ).toString("base64url");
    const cookie = cookieFor(`${signingInput}.${sig}`, exp);
    const f = vi.fn(async (u: unknown) => {
      const url = urlOf(u);
      if (url.includes("jwks")) return json(200, { keys: [jwk] });
      if (url.includes("/rest/v1/profiles")) return json(200, { id: USER.id });
      return json(500, { msg: "unexpected " + url });
    });
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", cookie));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
    expect(f.mock.calls.some(([u]) => urlOf(u).includes("/auth/v1/user"))).toBe(false);
    expect(f.mock.calls.some(([u]) => urlOf(u).includes("jwks"))).toBe(true);
  });

  it("a forged ES256 signature is not trusted", async () => {
    setEnv(GOOD);
    const good = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = { ...(await crypto.subtle.exportKey("jwk", good.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
    const exp = nowSec() + 3600;
    const signingInput = `${b64({ alg: "ES256", typ: "JWT", kid: "k1" })}.${b64(claims(exp))}`;
    const sig = Buffer.from(
      await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, other.privateKey, new TextEncoder().encode(signingInput)),
    ).toString("base64url");
    const f = vi.fn(async (u: unknown) => {
      const url = urlOf(u);
      if (url.includes("jwks")) return json(200, { keys: [jwk] });
      if (url.includes("/auth/v1/user")) return json(401, { msg: "invalid" });
      return json(404, {});
    });
    vi.stubGlobal("fetch", f);
    expect(location(await run(req("/hoy", cookieFor(`${signingInput}.${sig}`, exp))))).toBe("/login");
  });

  it("auth endpoint answering 401: signed out, redirect to /login (an auth answer, not an outage)", async () => {
    setEnv(GOOD);
    const f = vi.fn(async () => json(401, { msg: "invalid JWT" }));
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", true));
    expect(location(res)).toBe("/login");
    expect(res.status).not.toBe(503);
  });

  it("auth endpoint answering 403: signed out, redirect to /login", async () => {
    setEnv(GOOD);
    vi.stubGlobal("fetch", vi.fn(async () => json(403, { msg: "forbidden" })));
    expect(location(await run(req("/hoy", true)))).toBe("/login");
  });

  it("user call timing out with session cookies, protected path: 503 retry, nobody is logged out", async () => {
    setEnv(GOOD);
    const signals: unknown[] = [];
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      signals.push(init?.signal);
      throw new DOMException("timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", true));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("2");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toContain("Algo salió mal. Inténtalo de nuevo en unos minutos.");
    expect(loggedOut(f)).toBe(false);
  });

  it("user call timing out with session cookies, public path: the page loads", async () => {
    setEnv(GOOD);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    }));
    for (const p of ["/legal/terminos", "/login"]) {
      const res = await run(req(p, true));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("network failure with session cookies on / gives the retry answer, not /bienvenida", async () => {
    setEnv(GOOD);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    expect((await run(req("/", true))).status).toBe(503);
  });

  it("auth endpoint answering 500: retry answer, no sign-out, cookies untouched", async () => {
    setEnv(GOOD);
    const f = vi.fn<(u: unknown) => Promise<Response>>(async () => json(500, { msg: "down" }));
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", true));
    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(loggedOut(f)).toBe(false);
  });

  it("without session cookies a network failure is plain signed out", async () => {
    setEnv(GOOD);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    expect(location(await run(req("/hoy")))).toBe("/login");
  });

  it("signed in, profile query failing: request passes through, no sign-out", async () => {
    setEnv(GOOD);
    const f = vi.fn(async (u: unknown) => {
      const url = urlOf(u);
      if (url.includes("/auth/v1/user")) return json(200, USER);
      if (url.includes("/rest/v1/profiles")) return json(500, { message: "boom" });
      return json(404, {});
    });
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", true));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
    expect(loggedOut(f)).toBe(false);
  });

  it("the profile query is attempted once: a network failure is not retried", async () => {
    setEnv(GOOD);
    const f = vi.fn(async (u: unknown) => {
      const url = urlOf(u);
      if (url.includes("/auth/v1/user")) return json(200, USER);
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", true));
    expect(res.status).toBe(200);
    expect(f.mock.calls.filter(([u]) => urlOf(u).includes("/rest/v1/profiles"))).toHaveLength(1);
  });
});

describe("timeouts and the overall deadline", () => {
  it("timeoutFor: 10 s for the token endpoint, 3 s for everything else", async () => {
    const { timeoutFor, FETCH_TIMEOUT_MS, TOKEN_TIMEOUT_MS } = await import("@/lib/supabase/middleware");
    expect(FETCH_TIMEOUT_MS).toBe(3000);
    expect(TOKEN_TIMEOUT_MS).toBe(10_000);
    expect(timeoutFor(`${URL_OK}/auth/v1/token?grant_type=refresh_token`)).toBe(10_000);
    expect(timeoutFor(new URL(`${URL_OK}/auth/v1/token?grant_type=refresh_token`))).toBe(10_000);
    expect(timeoutFor(`${URL_OK}/auth/v1/user`)).toBe(5000);
    expect(timeoutFor(`${URL_OK}/rest/v1/profiles?select=id`)).toBe(3000);
  });

  it("slow token refresh that succeeds at 5 s: not aborted, the request passes with the new cookies", async () => {
    setEnv(GOOD);
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const newToken = hsToken(nowSec() + 3600);
    const f = vi.fn(async (u: unknown) => {
      const url = urlOf(u);
      if (url.includes("/auth/v1/token")) {
        await new Promise((r) => setTimeout(r, 5000));
        return json(200, {
          access_token: newToken,
          refresh_token: "rt2",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: nowSec() + 3600,
          user: USER,
        });
      }
      if (url.includes("/auth/v1/user")) return json(200, USER);
      if (url.includes("/rest/v1/profiles")) return json(200, { id: USER.id });
      return json(404, {});
    });
    vi.stubGlobal("fetch", f);
    const p = run(req("/hoy", expiredCookie()));
    await vi.advanceTimersByTimeAsync(5000);
    const res = await p;
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toContain("sb-abc-auth-token");
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    expect(f.mock.calls.filter(([u]) => urlOf(u).includes("/auth/v1/token"))).toHaveLength(1);
    expect(loggedOut(f)).toBe(false);
  });

  it("overall deadline (12 s) with session cookies: 503 on protected paths, the page loads on public ones, no sign-out", async () => {
    setEnv(GOOD);
    vi.useFakeTimers();
    const f = vi.fn(() => new Promise<Response>(() => {})); // never answers
    vi.stubGlobal("fetch", f);
    const protectedRes = run(req("/hoy", true));
    const publicRes = run(req("/legal/terminos", true));
    await vi.advanceTimersByTimeAsync(11_999);
    let settled = false;
    void protectedRes.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const a = await protectedRes;
    expect(a.status).toBe(503);
    expect(a.headers.get("location")).toBeNull();
    expect(a.headers.get("set-cookie")).toBeNull();
    const b = await publicRes;
    expect(b.headers.get("location")).toBeNull();
    expect(loggedOut(f)).toBe(false);
  });

  it("finishing before the deadline leaves no timer behind", async () => {
    setEnv(GOOD);
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    await run(req("/hoy"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
