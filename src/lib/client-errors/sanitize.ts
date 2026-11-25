/** Pure PII scrubbing for client error reports. Runs on the server before anything is stored. */
export const MAX_MESSAGE = 1000
export const MAX_STACK = 2000
export const MAX_PATH = 200

// Every quantifier is bounded (or a single linear class) so hostile input cannot make the scrubbing expensive.
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,4}/g
const JWT = /\beyJ[A-Za-z0-9_-]{5,1000}\.[A-Za-z0-9_-]{5,1000}\.[A-Za-z0-9_-]{5,1000}/g
const BEARER = /\b(Bearer\s{1,5})[A-Za-z0-9._~+/=-]{8,512}/gi
const HEX_RUN = /\b[0-9a-fA-F]{32,}\b/g
const B64_RUN = /[A-Za-z0-9+/_-]{40,512}={0,2}/g
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// the query string / fragment of an absolute URL or a relative path (stack frames and messages carry them);
// it stops before a trailing :line:col
const URL_QUERY = /((?:https?:\/\/[^\s?#)'"]{0,300}|\/[A-Za-z0-9._~%/-]{1,300}))[?#]([^\s)'"]{0,500})/g
const LOCATION_TAIL = /(?::\d+){1,2}$/

export function redact(text: string): string {
  let t = text.replace(JWT, '[token]').replace(BEARER, '$1[token]')
  // the email scan is the costly one on long word-like runs: skip it when there is no '@' at all
  if (t.includes('@')) t = t.replace(EMAIL, '[email]')
  return t
    .replace(UUID, ':id')
    .replace(HEX_RUN, '[hex]')
    .replace(B64_RUN, '[token]')
    .replace(URL_QUERY, (_m, url: string, query: string) => url + (LOCATION_TAIL.exec(query)?.[0] ?? ''))
}

/** Redact first, then cut: a secret split by the cap must not survive as a fragment. */
export function sanitizeMessage(message: string): string {
  return redact(message).trim().slice(0, MAX_MESSAGE)
}

export function sanitizeStack(stack: string | null | undefined): string | null {
  if (typeof stack !== 'string') return null
  const s = redact(stack).trim().slice(0, MAX_STACK)
  return s === '' ? null : s
}

/** Path only: no host, query or fragment; uuids and @usernames are collapsed so they neither identify nor split groups. */
export function sanitizePath(input: string | null | undefined): string {
  if (typeof input !== 'string') return '/'
  let p = input.trim()
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname
    } catch {
      return '/'
    }
  }
  if (!p.startsWith('/') || p.startsWith('//')) return '/'
  p = p.split(/[?#]/)[0].replace(UUID, ':id').replace(/^\/@[^/]*/, '/@:user').replace(/^\/u\/[^/]*/, '/u/:user').replace(/^\/(invite|g)\/[^/]*/, '/$1/:code')
  return p.slice(0, MAX_PATH) || '/'
}
