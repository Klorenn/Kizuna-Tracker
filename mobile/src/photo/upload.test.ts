import { PHOTO_SEND_FAILED } from "@/lib/photo-copy";
import { uploadPhoto } from "./upload";

const MULTIPART = 1;
const ok = { status: 200, checkinId: "c", created: true, isDuplicate: false, dayCompleted: false };
const send = (body: unknown, httpStatus = 200) => jest.fn(async () => ({ status: httpStatus, body: JSON.stringify(body) }));
const base = { apiUrl: "https://app.test", jwt: "a.b.c", fileUri: "file:///p.jpg", multipart: MULTIPART };

describe("uploadPhoto", () => {
  it("sends the multipart request the route expects: file field, habitId, bearer, no user id", async () => {
    const uploadAsync = send(ok);
    const r = await uploadPhoto({ ...base, target: { habitId: "h1" } }, { uploadAsync });
    expect(r).toEqual({ ok: true, dayCompleted: false, duplicate: false });
    expect(uploadAsync).toHaveBeenCalledWith("https://app.test/api/m/checkins/photo", "file:///p.jpg", {
      httpMethod: "POST",
      uploadType: MULTIPART,
      fieldName: "file",
      mimeType: "image/jpeg",
      parameters: { habitId: "h1" },
      headers: { Authorization: "Bearer a.b.c" },
    });
    expect(JSON.stringify(uploadAsync.mock.calls[0])).not.toMatch(/user_?id/i);
  });
  it("a step photo sends itemId and not habitId (the route refuses both)", async () => {
    const uploadAsync = send({ ...ok, dayCompleted: true });
    const r = await uploadPhoto({ ...base, target: { itemId: "i1" } }, { uploadAsync });
    expect(r).toMatchObject({ ok: true, dayCompleted: true });
    expect((uploadAsync.mock.calls[0] as unknown[])[2]).toMatchObject({ parameters: { itemId: "i1" } });
    expect(((uploadAsync.mock.calls[0] as unknown[])[2] as { parameters: object }).parameters).not.toHaveProperty("habitId");
  });
  it("a duplicate photo is reported", async () => {
    const r = await uploadPhoto({ ...base, target: { habitId: "h" } }, { uploadAsync: send({ ...ok, isDuplicate: true }) });
    expect(r).toMatchObject({ ok: true, duplicate: true });
  });
  it.each([
    [401, "Inicia sesión para continuar."],
    [413, "La foto pesa demasiado. Prueba con otra o toma una nueva."],
    [415, "La foto debe ser una imagen JPEG."],
    [502, "No pudimos guardar la foto. Inténtalo de nuevo."],
  ])("the route's %s copy is shown as is", async (status, error) => {
    const r = await uploadPhoto({ ...base, target: { habitId: "h" } }, { uploadAsync: send({ status, error }, status) });
    expect(r).toEqual({ ok: false, error });
  });
  it("a request that never gets an answer says it could not be sent", async () => {
    const uploadAsync = jest.fn(async () => { throw new Error("Network request failed"); });
    expect(await uploadPhoto({ ...base, target: { habitId: "h" } }, { uploadAsync })).toEqual({ ok: false, error: PHOTO_SEND_FAILED });
  });
  it("a body that is not the route's JSON says it could not be sent", async () => {
    const uploadAsync = jest.fn(async () => ({ status: 502, body: "<html>bad gateway</html>" }));
    expect(await uploadPhoto({ ...base, target: { habitId: "h" } }, { uploadAsync })).toEqual({ ok: false, error: PHOTO_SEND_FAILED });
  });
});
