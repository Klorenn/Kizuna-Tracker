/** Pure PII scrubbing for client error reports. Runs on the server before anything is stored. */
export const MAX_MESSAGE = 1000
export const MAX_STACK = 4000
export const MAX_PATH = 200

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi
const HEX_RUN = /\b[0-9a-fA-F]{32,}\b/g
const B64_RUN = /[A-Za-z0-9+/_-]{40,}={0,2}/g
// the query string / fragment of an absolute URL (stack frames and messages carry them)
const URL_QUERY = /(https?:\/\/[^\s?#)'"]*)[?#][^\s)'"]*?(?=(?::\d+){1,2}(?:[\s)'"]|$)|[\s)'"]|$)/g
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export function redact(text: string): string {
  return text
    .replace(JWT, '[token]')
    .replace(BEARER, '$1[token]')
    .replace(EMAIL, '[email]')
    .replace(HEX_RUN, '[hex]')
    .replace(B64_RUN, '[token]')
    .replace(URL_QUERY, '$1')
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
  p = p.split(/[?#]/)[0].replace(UUID, ':id').replace(/^\/@[^/]*/, '/@:user')
  return p.slice(0, MAX_PATH) || '/'
}
