import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isGroupInvitePath } from "@/lib/supabase/public-paths";

const ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
];
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
const exp = () => nowSec() + 3600;
const token = () =>
  `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, aud: "authenticated", role: "authenticated", email: USER.email, session_id: "s1", iat: exp() - 3600, exp: exp() })}.sig`;
const cookie = () =>
  `sb-abc-auth-token=base64-${Buffer.from(
    JSON.stringify({ access_token: token(), refresh_token: "rt", token_type: "bearer", expires_in: 3600, expires_at: exp(), user: USER }),
  ).toString("base64url")}`;
const req = (path: string) => new NextRequest(`https://app.test${path}`, { headers: { cookie: cookie() } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const urlOf = (u: unknown) => String(u);

beforeEach(() => {
  vi.resetModules();
  for (const n of ENV_NAMES) vi.stubEnv(n, "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function profileReads(path: string) {
  const f = vi.fn(async (u: unknown) => {
    const url = urlOf(u);
    if (url.includes("/auth/v1/user")) return json(200, USER);
    if (url.includes("/rest/v1/profiles")) return json(200, { id: USER.id });
    return json(404, {});
  });
  vi.stubGlobal("fetch", f);
  const { updateSession } = await import("@/lib/supabase/middleware");
  const res = await updateSession(req(path));
  return { res, reads: f.mock.calls.filter(([u]) => urlOf(u).includes("/rest/v1/profiles")).length };
}

describe("updateSession: a signed-in visitor on a group invitation gets the same profile check as /invite/", () => {
  it.each(["/g/K7QM4PXD", "/g/k7qm-4pxd", "/invite/abc"])("%s reads the profile (so a deleted or missing one is signed out)", async (path) => {
    const { reads } = await profileReads(path);
    expect(reads).toBe(1);
  });

  it("other public pages still skip it", async () => {
    expect((await profileReads("/legal/terminos")).reads).toBe(0);
    expect((await profileReads("/@pau_k")).reads).toBe(0);
  });

  it("a path that only looks like an invitation does not take the branch", async () => {
    expect((await profileReads("/g/K7QM4PX0")).reads).toBe(1); // not public: the ordinary protected-page check
    expect(isGroupInvitePath("/g/K7QM4PX0")).toBe(false);
    expect(isGroupInvitePath("/g/K7QM4PXD")).toBe(true);
    expect(isGroupInvitePath("/g/k7qm-4pxd")).toBe(true);
  });
});
