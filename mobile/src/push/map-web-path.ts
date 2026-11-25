import { safeInternalPath } from "@/lib/safe-internal-path";

/**
 * The app route for a push/deep-link web `url` (the same path the web notification carries). The app is the web inside one
 * WebView, so every path opens there: the home route with the path (and a nonce, so a repeated tap reloads it). Only a
 * same-origin relative path is accepted; null means do not navigate.
 */
export function mapWebPath(url: unknown, nonce: number = Date.now()): string | null {
  const path = safeInternalPath(url);
  return path ? `/?path=${encodeURIComponent(path)}&n=${nonce}` : null;
}
