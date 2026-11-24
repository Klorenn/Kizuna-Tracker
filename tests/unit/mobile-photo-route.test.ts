import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyJwt = vi.fn();
const photoCheckin = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({ verifyJwt: (jwt: string) => verifyJwt(jwt) }));
vi.mock("@/lib/photo-checkin-deps", () => ({ supabaseDeps: () => ({}) }));
vi.mock("@/lib/checkins", async (orig) => ({ ...(await orig<typeof import("@/lib/checkins")>()), photoCheckin: (...a: unknown[]) => photoCheckin(...a) }));

import { POST } from "@/app/api/m/checkins/photo/route";

const JWT = "aaa.bbb.ccc";
async function request(headers: Record<string, string>, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), "p.jpg");
  form.append("habitId", "h1");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const raw = new Request("http://x/api/m/checkins/photo", { method: "POST", body: form });
  const body = await raw.arrayBuffer();
  return new Request("http://x/api/m/checkins/photo", {
    method: "POST",
    body,
    headers: { "content-type": raw.headers.get("content-type")!, "content-length": String(body.byteLength), ...headers },
  });
}

describe("POST /api/m/checkins/photo", () => {
  beforeEach(() => {
    verifyJwt.mockReset();
    photoCheckin.mockReset();
  });
  it("401 without a bearer token, and nothing is saved", async () => {
    const res = await POST(await request({}));
    expect(res.status).toBe(401);
    expect(photoCheckin).not.toHaveBeenCalled();
  });
  it("401 when the token does not verify", async () => {
    verifyJwt.mockResolvedValue(null);
    expect((await POST(await request({ authorization: `Bearer ${JWT}` }))).status).toBe(401);
    expect(photoCheckin).not.toHaveBeenCalled();
  });
  it("takes the user id from the verified JWT and ignores user_id in the body", async () => {
    verifyJwt.mockResolvedValue({ sub: "real-user" });
    photoCheckin.mockResolvedValue({ status: 200, checkinId: "c", created: true, isDuplicate: false, dayCompleted: false });
    const res = await POST(await request({ authorization: `Bearer ${JWT}` }, { user_id: "attacker" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(photoCheckin).toHaveBeenCalledWith(expect.anything(), "real-user", { kind: "habit", habitId: "h1" }, expect.anything(), expect.any(Date));
  });
  it("returns the same refusal codes and copy as the web route", async () => {
    verifyJwt.mockResolvedValue({ sub: "u" });
    photoCheckin.mockResolvedValue({ status: 413, error: "La foto pesa demasiado." });
    const res = await POST(await request({ authorization: `Bearer ${JWT}` }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ status: 413, error: "La foto pesa demasiado." });
  });
});
