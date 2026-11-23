/**
 * The service worker caches ONLY immutable public assets. Everything else (pages, RSC payloads,
 * /api, Supabase and signed photo URLs) goes straight to the network, so nothing authenticated
 * is ever stored on the device or shared between users of the same browser.
 */
export type CacheMatch = { url: URL; sameOrigin: boolean; request: Pick<Request, 'destination'> }

export function isStaticAsset({ url, sameOrigin, request }: CacheMatch): boolean {
  if (!sameOrigin) return false
  const p = url.pathname
  return p.startsWith('/_next/static/') || p.startsWith('/icons/') || p.startsWith('/brand/') || p.startsWith('/avatars/') || request.destination === 'font'
}

/** Names of the runtime caches (not the precache) the page clears on sign-out. */
export const STATIC_CACHE_NAME = 'kizuna-static'

/**
 * Files the service worker downloads on install (Serwist precache). Serwist's default also takes
 * every file in public/, which pulled the 3 MB of cat GIFs onto the phone while the first screen
 * was still loading. Brand art is cached on first use instead (isStaticAsset above).
 */
export const PRECACHE_GLOBS = [
  '.next/static/**/*.{js,css,html,ico,apng,png,avif,jpg,jpeg,jfif,pjpeg,pjp,gif,svg,webp,json,webmanifest}',
  'public/icons/**/*',
  'public/avatars/**/*',
]
