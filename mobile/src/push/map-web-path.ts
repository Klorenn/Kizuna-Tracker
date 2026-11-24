import { safeInternalPath } from "@/lib/safe-internal-path";

/** The web paths that already have a native screen (the four web tabs are native tabs holding a WebView). Anything else opens in the WebView screen. */
const NATIVE = [/^\/$/, /^\/(?:amigos|retos|resumen|perfil)$/, /^\/habitos\/[A-Za-z0-9-]+$/, /^\/registros\/[A-Za-z0-9-]+\/(?:quantity|time|pomodoro|reading|workout|cardio|watch|photo)$/];

/**
 * The app route for a push/deep-link web `url` (the same path the web notification carries): the native screen when one
 * exists, else `/web?path=` (the WebView). Only a same-origin relative path is accepted; null means do not navigate.
 */
export function mapWebPath(url: unknown): string | null {
  const path = safeInternalPath(url);
  if (!path) return null;
  const bare = path.split("?")[0];
  return NATIVE.some((re) => re.test(bare)) && path === bare ? path : `/web?path=${encodeURIComponent(path)}`;
}
