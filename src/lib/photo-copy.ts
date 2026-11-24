/**
 * The limits and Spanish copy of the photo check-in, in one pure module: the web route, the web uploader and the
 * native app all say the same thing.
 */
/** Vercel rejects request bodies over 4.5 MB: 4 MB for the photo leaves room for the form fields. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/** Client-side compression target (MB), under MAX_PHOTO_BYTES with margin for the multipart envelope. */
export const PHOTO_TARGET_MB = 3;

export const PHOTO_TOO_BIG = "La foto pesa demasiado. Prueba con otra o toma una nueva.";
export const PHOTO_NOT_JPEG = "La foto debe ser una imagen JPEG.";
export const PHOTO_SAVE_ERROR = "No pudimos guardar la foto. Inténtalo de nuevo.";
/** The request never got an answer (offline, dropped): shown by the web uploader and the native one. */
export const PHOTO_SEND_FAILED = "No pudimos enviar la foto. Inténtalo de nuevo.";
