"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/viewer";
import { loadPickerMediaOrNull, type PickerMedia } from "./media-data";

export type WatchMediaResult = { ok: true; media: PickerMedia[] } | { ok: false; error: string };

/**
 * The titles for Hoy's watch sheet, read when the sheet opens (only users with a watch habit ever
 * need them, so Hoy itself does not load them). Own rows only, through the viewer's session.
 */
export async function loadWatchMedia(): Promise<WatchMediaResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  try {
    const media = await loadPickerMediaOrNull(await createServerClient(), user.id);
    if (media) return { ok: true, media };
  } catch {
    // falls through to the generic message
  }
  return { ok: false, error: "No pudimos cargar tus títulos. Inténtalo de nuevo." };
}
