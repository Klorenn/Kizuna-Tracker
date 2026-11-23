/**
 * Brand files in public/brand keep their names when they are re-encoded, and the service worker
 * keeps them with no expiry (CacheFirst; Serwist matches the full URL, query included). Bump this
 * on every re-encode so browsers and the SW fetch the new bytes instead of the old ones.
 * Versions: 1 = the owner's originals, 2 = the gifsicle re-encode (480 and 320 canvases).
 */
export const BRAND_ASSET_VERSION = "2";

/** Public URL of a file in public/brand, with the version query. */
export function brandUrl(file: string): string {
  return `/brand/${file}?v=${BRAND_ASSET_VERSION}`;
}
