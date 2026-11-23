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
function sessionCookie() {
  const session = {
    access_token: "at",
    refresh_token: "rt",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: USER,
  };
  return `sb-abc-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}
function req(path: string, signedIn = false) {
  return new NextRequest(`https://app.test${path}`, {
    headers: signedIn ? { cookie: sessionCookie() } : {},
  });
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function run(request: NextRequest) {
  const { updateSession } = await import("@/lib/supabase/middleware");
  return updateSession(request);
}
function location(res: Response) {
  const l = res.headers.get("location");
  return l ? new URL(l).pathname : null;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetModules();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
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

  it("auth endpoint timing out: signed-out rules, no sign-out, no cookie changes", async () => {
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
    expect(location(res)).toBe("/login");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u).includes("/logout"))).toBe(false);
  });

  it("auth endpoint answering 500: signed-out rules, cookies untouched", async () => {
    setEnv(GOOD);
    const f = vi.fn<(u: unknown) => Promise<Response>>(async () => json(500, { msg: "down" }));
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", true));
    expect(location(res)).toBe("/login");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u).includes("/logout"))).toBe(false);
  });

  it("signed in, profile query failing: request passes through, no sign-out", async () => {
    setEnv(GOOD);
    const f = vi.fn(async (u: unknown) => {
      const url = String(u);
      if (url.includes("/auth/v1/user")) return json(200, USER);
      if (url.includes("/rest/v1/profiles")) return json(500, { message: "boom" });
      return json(404, {});
    });
    vi.stubGlobal("fetch", f);
    const res = await run(req("/hoy", true));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
    expect(f.mock.calls.some(([u]) => String(u).includes("/logout"))).toBe(false);
  });
});
