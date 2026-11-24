/**
 * The only paths the native app may ask the web to open (handoff `next`, push deep links to the WebView). A same-origin
 * relative path made of URL-safe characters, with an optional short query: no scheme, no host, no `//`, no backslash,
 * no dot segment, no fragment, no encoded characters. Pure: shared by the web routes and the native app.
 */
const MAX_PATH = 512
const MAX_QUERY = 128
const PATH = /^\/[A-Za-z0-9/_@.-]*$/
/** The web app's page routes (src/app/(app)) plus the public profile paths. Never /auth, /api or any route outside this list. */
const PAGES = new Set(['amigos', 'deudas', 'grupos', 'habitos', 'libros', 'listo', 'metas', 'notificaciones', 'perfil', 'registros', 'resumen', 'retos', 'series', 'u'])
const QUERY = /^[A-Za-z0-9_=&.-]*$/

/** `value` when it is a safe internal path, else null. */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const q = value.indexOf('?')
  const path = q === -1 ? value : value.slice(0, q)
  const query = q === -1 ? '' : value.slice(q + 1)
  if (path.length === 0 || path.length > MAX_PATH || query.length > MAX_QUERY) return null
  if (!PATH.test(path) || !QUERY.test(query)) return null
  if (path.includes('//') || path.split('/').some((s) => s === '.' || s === '..')) return null
  const first = path.split('/')[1]
  if (first !== '' && !first.startsWith('@') && !PAGES.has(first)) return null
  return value
}
