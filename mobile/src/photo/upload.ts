import { PHOTO_SEND_FAILED } from "@/lib/photo-copy";

export type PhotoTarget = { habitId: string; itemId?: undefined } | { itemId: string; habitId?: undefined };
export type UploadDeps = {
  /** expo-file-system `uploadAsync` (legacy API): a multipart POST that streams the file and sends a Content-Length */
  uploadAsync: (
    url: string,
    fileUri: string,
    options: {
      httpMethod: "POST";
      uploadType: number;
      fieldName: string;
      mimeType: string;
      parameters: Record<string, string>;
      headers: Record<string, string>;
    },
  ) => Promise<{ status: number; body: string }>;
};
export type UploadOutcome = { ok: true; dayCompleted: boolean; duplicate: boolean } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * POST /api/m/checkins/photo. The form carries the `file` and exactly one of `habitId` / `itemId`; the user comes from
 * the bearer token, so no user id is sent. The route's JSON (`{status, error}` with the web's copy) is passed through.
 */
export async function uploadPhoto(
  args: { apiUrl: string; jwt: string; fileUri: string; target: PhotoTarget; multipart: number },
  deps: UploadDeps,
): Promise<UploadOutcome> {
  const parameters: Record<string, string> = args.target.itemId !== undefined ? { itemId: args.target.itemId } : { habitId: args.target.habitId! };
  let res: { status: number; body: string };
  try {
    res = await deps.uploadAsync(`${args.apiUrl}/api/m/checkins/photo`, args.fileUri, {
      httpMethod: "POST",
      uploadType: args.multipart,
      fieldName: "file",
      mimeType: "image/jpeg",
      parameters,
      headers: { Authorization: `Bearer ${args.jwt}` },
    });
  } catch {
    return { ok: false, error: PHOTO_SEND_FAILED };
  }
  let body: unknown;
  try {
    body = JSON.parse(res.body);
  } catch {
    return { ok: false, error: PHOTO_SEND_FAILED };
  }
  if (!isRecord(body)) return { ok: false, error: PHOTO_SEND_FAILED };
  if (body.status === 200) return { ok: true, dayCompleted: body.dayCompleted === true, duplicate: body.isDuplicate === true };
  return { ok: false, error: typeof body.error === "string" ? body.error : PHOTO_SEND_FAILED };
}
