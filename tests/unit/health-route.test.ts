import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
];
function setEnv(env: Record<string, string>) {
  for (const n of NAMES) vi.stubEnv(n, "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}
const FULL = {
  NEXT_PUBLIC_SUPABASE_URL: "https://h.example",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "k",
  SUPABASE_SERVICE_ROLE_KEY: "s",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal("fetch", f);
  return f;
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function health() {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  return { res, body: await res.json() };
}

describe("GET /api/health", () => {
  it("200: table reachable, ok", async () => {
    setEnv(FULL);
    const f = stubFetch(async () => json(200, []));
    const { res, body } = await health();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ ok: true, config: { url: true, publicKey: true, serviceKey: true }, schema: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method ?? "GET").toBe("GET");
    expect(String(url)).toContain("limit=0");
  });
  it("401 with 42501: table exists, anon has no grant", async () => {
    setEnv(FULL);
    stubFetch(async () => json(401, { code: "42501", message: "permission denied for table profiles" }));
    expect((await health()).body.schema).toBe(true);
  });
  it("401 without the 42501 code does not prove the table exists", async () => {
    setEnv(FULL);
    stubFetch(async () => json(401, { message: "Invalid API key" }));
    expect((await health()).body.schema).toBe(false);
  });
  it("403 without the 42501 code does not prove the table exists", async () => {
    setEnv(FULL);
    stubFetch(async () => json(403, {}));
    expect((await health()).body.schema).toBe(false);
  });
  it("404 with PGRST205: table missing", async () => {
    setEnv(FULL);
    stubFetch(async () => json(404, { code: "PGRST205", message: "Could not find the table" }));
    const { body } = await health();
    expect(body.schema).toBe(false);
    expect(body.ok).toBe(false);
  });
  it("404 with an empty body: table missing", async () => {
    setEnv(FULL);
    stubFetch(async () => new Response("", { status: 404 }));
    expect((await health()).body.schema).toBe(false);
  });
  it("network error: false", async () => {
    setEnv(FULL);
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await health()).body.schema).toBe(false);
  });
  it("timeout: false", async () => {
    setEnv(FULL);
    stubFetch(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect((await health()).body.schema).toBe(false);
  });
  it("missing config: no request, schema false", async () => {
    setEnv({});
    const f = stubFetch(async () => json(200, []));
    expect((await health()).body).toEqual({
      ok: false,
      config: { url: false, publicKey: false, serviceKey: false },
      schema: false,
    });
    expect(f).not.toHaveBeenCalled();
  });
  it("leaks no values, hosts or messages", async () => {
    setEnv(FULL);
    stubFetch(async () => json(500, { message: "boom h.example" }));
    const text = JSON.stringify((await health()).body);
    expect(text).not.toMatch(/boom|h\.example/);
  });
});
