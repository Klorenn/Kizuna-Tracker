import { afterEach, describe, expect, it, vi } from "vitest";

const head = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ abortSignal: () => head() }) }) }),
}));
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
  head.mockReset();
});

describe("GET /api/health", () => {
  it("all present and schema reachable: ok", async () => {
    setEnv(FULL);
    head.mockResolvedValue({ error: null });
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      ok: true,
      config: { url: true, publicKey: true, serviceKey: true },
      schema: true,
    });
  });
  it("missing config: schema false, no request made", async () => {
    setEnv({});
    const { GET } = await import("@/app/api/health/route");
    expect(await (await GET()).json()).toEqual({
      ok: false,
      config: { url: false, publicKey: false, serviceKey: false },
      schema: false,
    });
    expect(head).not.toHaveBeenCalled();
  });
  it("schema error: false and leaks nothing", async () => {
    setEnv(FULL);
    head.mockResolvedValue({ error: { message: "boom h.example" } });
    const { GET } = await import("@/app/api/health/route");
    const text = JSON.stringify(await (await GET()).json());
    expect(text).toContain('"schema":false');
    expect(text).not.toMatch(/boom|h\.example/);
  });
  it("thrown request: schema false, ok false", async () => {
    setEnv(FULL);
    head.mockRejectedValue(new Error("net"));
    const { GET } = await import("@/app/api/health/route");
    const body = await (await GET()).json();
    expect(body.schema).toBe(false);
    expect(body.ok).toBe(false);
  });
});
