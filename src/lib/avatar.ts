import { stripJpegMetadata } from "@/lib/checkins";
import { supabaseRenderUrl } from "@/lib/supabase/env";

export const MAX_AVATAR_BYTES = 1024 * 1024;

/** Server-side gate for avatar uploads: JPEG only, ≤ 1 MB, metadata (EXIF/XMP/comments) removed. */
export function processAvatar(
  bytes: ArrayBuffer,
  type: string,
): { ok: true; bytes: ArrayBuffer } | { ok: false; error: string } {
  if (type !== "image/jpeg") return { ok: false, error: "La foto debe ser una imagen JPEG." };
  const clean = stripJpegMetadata(bytes);
  if (!clean) return { ok: false, error: "La foto debe ser una imagen JPEG." };
  if (clean.byteLength > MAX_AVATAR_BYTES) return { ok: false, error: "La foto pesa demasiado. El máximo es 1 MB." };
  return { ok: true, bytes: clean };
}

/** Public URL of an avatar in the public `avatars` bucket (client and server safe). */
export function avatarUrl(path: string | null | undefined, updatedAt?: string | null): string | null {
  const base = supabaseRenderUrl()?.replace(/\/+$/, "");
  if (!path || !base) return null;
  const v = updatedAt ? Date.parse(updatedAt) : NaN;
  return `${base}/storage/v1/object/public/avatars/${path}${Number.isNaN(v) ? "" : `?v=${v}`}`;
}
