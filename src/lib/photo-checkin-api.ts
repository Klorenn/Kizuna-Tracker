import { contentLengthError, photoCheckin, type PhotoCheckinDeps, type PhotoCheckinResult, type PhotoTarget } from "@/lib/checkins";

type Args = {
  request: Request;
  /** The authenticated user id: the cookie session (web) or the verified bearer JWT (native). Never a request field. */
  authenticate: () => Promise<string | null>;
  deps: PhotoCheckinDeps;
  now: Date;
};

/**
 * The body of the photo check-in endpoint, shared by the web route (cookie session) and the native one (bearer JWT):
 * the same errors and codes. The user id comes only from `authenticate`; a `user_id` in the body is never read.
 */
export async function handlePhotoRequest({ request, authenticate, deps, now }: Args): Promise<PhotoCheckinResult> {
  try {
    const userId = await authenticate();
    if (!userId) return { status: 401, error: "Inicia sesión para continuar." };

    // a body without a valid Content-Length (e.g. chunked) is refused before buffering
    const tooBig = contentLengthError(request.headers.get("content-length"));
    if (tooBig) return tooBig;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { status: 400, error: "Solicitud no válida." };
    }
    const file = form.get("file");
    const habitId = form.get("habitId");
    const itemId = form.get("itemId");
    if (!(file instanceof File)) return { status: 400, error: "Falta la foto." };
    let target: PhotoTarget;
    if (typeof itemId === "string" && itemId && !habitId) target = { kind: "item", itemId };
    else if (typeof habitId === "string" && habitId && !itemId) target = { kind: "habit", habitId };
    else return { status: 400, error: "Falta el hábito o el paso." };

    return await photoCheckin(deps, userId, target, { bytes: await file.arrayBuffer(), type: file.type, size: file.size }, now);
  } catch {
    return { status: 502, error: "No pudimos guardar la foto. Inténtalo de nuevo." };
  }
}
