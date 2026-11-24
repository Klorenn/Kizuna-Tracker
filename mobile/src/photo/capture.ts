import { PHOTO_SEND_FAILED } from "@/lib/photo-copy";
import type { Prepared } from "./compress";
import type { PhotoTarget, UploadOutcome } from "./upload";

export const CAMERA_DENIED = "Permite el acceso a la cámara para tomar la foto.";
const NO_SESSION = "Inicia sesión para continuar.";

export type CaptureDeps = {
  requestCamera: () => Promise<boolean>;
  /** null when the user cancels */
  launchCamera: () => Promise<{ uri: string; mimeType?: string } | null>;
  prepare: (uri: string, mimeType?: string) => Promise<Prepared>;
  getJwt: () => Promise<string | null>;
  upload: (args: { target: PhotoTarget; jwt: string; fileUri: string }) => Promise<UploadOutcome>;
};
export type CaptureOutcome =
  | { status: "sent"; dayCompleted: boolean; duplicate: boolean }
  | { status: "cancelled" }
  | { status: "error"; error: string };

/** Camera, then compress to 4 MB or less, then upload. Nothing is queued: a photo is online-only. */
export async function takeAndSendPhoto(target: PhotoTarget, deps: CaptureDeps): Promise<CaptureOutcome> {
  try {
    if (!(await deps.requestCamera())) return { status: "error", error: CAMERA_DENIED };
    const shot = await deps.launchCamera();
    if (!shot) return { status: "cancelled" };
    const ready = await deps.prepare(shot.uri, shot.mimeType);
    if (!ready.ok) return { status: "error", error: ready.error };
    const jwt = await deps.getJwt();
    if (!jwt) return { status: "error", error: NO_SESSION };
    const sent = await deps.upload({ target, jwt, fileUri: ready.uri });
    return sent.ok ? { status: "sent", dayCompleted: sent.dayCompleted, duplicate: sent.duplicate } : { status: "error", error: sent.error };
  } catch {
    return { status: "error", error: PHOTO_SEND_FAILED };
  }
}
