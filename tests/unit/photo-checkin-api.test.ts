import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePhotoRequest } from "@/lib/photo-checkin-api";
import type { PhotoCheckinDeps } from "@/lib/checkins";

const photoCheckin = vi.fn();
vi.mock("@/lib/checkins", async (orig) => ({ ...(await orig<typeof import("@/lib/checkins")>()), photoCheckin: (...a: unknown[]) => photoCheckin(...a) }));

const deps = {} as PhotoCheckinDeps;
const NOW = new Date("2026-11-25T12:00:00Z");

/** A multipart request with a real Content-Length (what uploadAsync sends); `length` overrides it, null removes it. */
async function req(parts: Record<string, string | Blob>, length?: string | null) {
  const form = new FormData();
  for (const [k, v] of Object.entries(parts)) {
    if (typeof v === "string") form.append(k, v);
    else form.append(k, v, "p.jpg");
  }
  const raw = new Request("http://x/api/m/checkins/photo", { method: "POST", body: form });
  const body = await raw.arrayBuffer();
  const headers = new Headers({ "content-type": raw.headers.get("content-type")! });
  if (length === undefined) headers.set("content-length", String(body.byteLength));
  else if (length !== null) headers.set("content-length", length);
  return new Request("http://x/api/m/checkins/photo", { method: "POST", body, headers });
}
const jpeg = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
const call = (request: Request, userId: string | null = "u1") => handlePhotoRequest({ request, authenticate: async () => userId, deps, now: NOW });

describe("handlePhotoRequest", () => {
  beforeEach(() => photoCheckin.mockReset());

  it("401 with the web copy and nothing read when there is no user", async () => {
    expect(await call(await req({ file: jpeg(), habitId: "h" }), null)).toEqual({ status: 401, error: "Inicia sesión para continuar." });
    expect(photoCheckin).not.toHaveBeenCalled();
  });
  it("411 when the body has no Content-Length (chunked)", async () => {
    const r = await call(await req({ file: jpeg(), habitId: "h" }, null));
    expect(r.status).toBe(411);
  });
  it("413 when the Content-Length is over the limit", async () => {
    const r = await call(await req({ file: jpeg(), habitId: "h" }, String(5 * 1024 * 1024)));
    expect(r.status).toBe(413);
  });
  it("400 for a body that is not a form", async () => {
    const r = new Request("http://x", { method: "POST", body: "nope", headers: { "content-type": "text/plain", "content-length": "4" } });
    expect(await call(r)).toEqual({ status: 400, error: "Solicitud no válida." });
  });
  it("400 without a file, and without exactly one of habitId or itemId", async () => {
    expect(await call(await req({ habitId: "h" }))).toEqual({ status: 400, error: "Falta la foto." });
    expect(await call(await req({ file: jpeg() }))).toEqual({ status: 400, error: "Falta el hábito o el paso." });
    expect(await call(await req({ file: jpeg(), habitId: "h", itemId: "i" }))).toEqual({ status: 400, error: "Falta el hábito o el paso." });
  });
  it("sends a habit photo for the authenticated user", async () => {
    photoCheckin.mockResolvedValue({ status: 200, checkinId: "c", created: true, isDuplicate: false, dayCompleted: false });
    const r = await call(await req({ file: jpeg(), habitId: "h1" }), "u1");
    expect(r.status).toBe(200);
    expect(photoCheckin).toHaveBeenCalledWith(deps, "u1", { kind: "habit", habitId: "h1" }, expect.objectContaining({ type: "image/jpeg", size: 3 }), NOW);
  });
  it("sends a step photo, and ignores a user_id field in the body", async () => {
    photoCheckin.mockResolvedValue({ status: 200, checkinId: "c", created: true, isDuplicate: false, dayCompleted: true });
    await call(await req({ file: jpeg(), itemId: "i1", user_id: "attacker", userId: "attacker" }), "u1");
    expect(photoCheckin).toHaveBeenCalledWith(deps, "u1", { kind: "item", itemId: "i1" }, expect.anything(), NOW);
  });
  it("passes the photoCheckin refusal through (same codes as the web)", async () => {
    photoCheckin.mockResolvedValue({ status: 415, error: "x" });
    expect(await call(await req({ file: jpeg(), habitId: "h" }))).toEqual({ status: 415, error: "x" });
  });
  it("a thrown error (here the auth lookup) is the 502 save copy", async () => {
    const r = await handlePhotoRequest({
      request: await req({ file: jpeg(), habitId: "h" }),
      authenticate: async () => {
        throw new Error("boom");
      },
      deps,
      now: NOW,
    });
    expect(r).toEqual({ status: 502, error: "No pudimos guardar la foto. Inténtalo de nuevo." });
  });
});
