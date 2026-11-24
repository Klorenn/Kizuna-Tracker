import { PHOTO_SEND_FAILED, PHOTO_TOO_BIG } from "@/lib/photo-copy";
import { CAMERA_DENIED, takeAndSendPhoto } from "./capture";

const deps = (over = {}) => ({
  requestCamera: jest.fn(async () => true),
  launchCamera: jest.fn(async () => ({ uri: "file:///raw.jpg", mimeType: "image/jpeg" }) as { uri: string; mimeType?: string } | null),
  prepare: jest.fn(async () => ({ ok: true as const, uri: "file:///small.jpg", size: 1000 })),
  getJwt: jest.fn(async () => "a.b.c"),
  upload: jest.fn(async () => ({ ok: true as const, dayCompleted: false, duplicate: false })),
  ...over,
});
const target = { habitId: "h1" };

describe("takeAndSendPhoto", () => {
  it("camera, compress, upload, in that order, and reports sent", async () => {
    const d = deps();
    expect(await takeAndSendPhoto(target, d)).toEqual({ status: "sent", dayCompleted: false, duplicate: false });
    expect(d.prepare).toHaveBeenCalledWith("file:///raw.jpg", "image/jpeg");
    expect(d.upload).toHaveBeenCalledWith({ target, jwt: "a.b.c", fileUri: "file:///small.jpg" });
  });
  it("a denied camera permission asks the user to allow it and takes no photo", async () => {
    const d = deps({ requestCamera: jest.fn(async () => false) });
    expect(await takeAndSendPhoto(target, d)).toEqual({ status: "error", error: CAMERA_DENIED });
    expect(d.launchCamera).not.toHaveBeenCalled();
  });
  it("cancelling the camera is not an error and sends nothing", async () => {
    const d = deps({ launchCamera: jest.fn(async () => null) });
    expect(await takeAndSendPhoto(target, d)).toEqual({ status: "cancelled" });
    expect(d.upload).not.toHaveBeenCalled();
  });
  it("a photo still over 4 MB is never sent", async () => {
    const d = deps({ prepare: jest.fn(async () => ({ ok: false as const, error: PHOTO_TOO_BIG })) });
    expect(await takeAndSendPhoto(target, d)).toEqual({ status: "error", error: PHOTO_TOO_BIG });
    expect(d.upload).not.toHaveBeenCalled();
  });
  it("no session means no request", async () => {
    const d = deps({ getJwt: jest.fn(async () => null) });
    expect(await takeAndSendPhoto(target, d)).toEqual({ status: "error", error: "Inicia sesión para continuar." });
    expect(d.upload).not.toHaveBeenCalled();
  });
  it("an upload refusal is passed through; a thrown error is the send-failed copy", async () => {
    const refused = deps({ upload: jest.fn(async () => ({ ok: false as const, error: "No tienes acceso." })) });
    expect(await takeAndSendPhoto(target, refused)).toEqual({ status: "error", error: "No tienes acceso." });
    const thrown = deps({ launchCamera: jest.fn(async () => { throw new Error("camera crashed"); }) });
    expect(await takeAndSendPhoto(target, thrown)).toEqual({ status: "error", error: PHOTO_SEND_FAILED });
  });
});
