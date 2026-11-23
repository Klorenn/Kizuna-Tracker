const MAX_IP_LENGTH = 45 // longest textual IPv6

/**
 * Client address for rate limiting. Prefers headers set by the platform edge
 * (x-vercel-forwarded-for, x-real-ip) over the client-appendable x-forwarded-for.
 * Returns null when nothing usable is present: callers must then skip IP keys
 * rather than share one bucket.
 */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const candidates = [
    headers.get('x-vercel-forwarded-for'),
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for')?.split(',')[0] ?? null,
  ]
  for (const raw of candidates) {
    const v = raw?.split(',')[0]?.trim()
    if (v && v.length <= MAX_IP_LENGTH) return v
  }
  return null
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function ipv4(v: string): string | null {
  const m = IPV4.exec(v)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  return parts.every((n) => n <= 255) ? parts.join('.') : null
}

/** Eight 16-bit groups of an IPv6 text, or null. Accepts `::` once and a trailing dotted IPv4. */
function ipv6Groups(v: string): number[] | null {
  let text = v
  const cut = text.lastIndexOf(':') + 1
  const tail = text.slice(cut)
  if (tail.includes('.')) {
    const four = ipv4(tail)
    if (four === null) return null
    const [a, b, c, d] = four.split('.').map(Number)
    text = `${text.slice(0, cut)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const side = (s: string) => (s === '' ? [] : s.split(':'))
  const head = side(halves[0])
  const rest = halves.length === 2 ? side(halves[1]) : []
  if (![...head, ...rest].every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return null
  if (halves.length === 1 ? head.length !== 8 : head.length + rest.length > 7) return null
  const zeros = halves.length === 2 ? new Array<string>(8 - head.length - rest.length).fill('0') : []
  return [...head, ...zeros, ...rest].map((g) => parseInt(g, 16))
}

const PORT = /^\d{1,5}$/
const validPort = (p: string) => PORT.test(p) && Number(p) <= 65535

/** The address inside `[v6]`, `[v6]:port` or `v4:port`; other text unchanged; null for a malformed bracket or port. */
function hostOf(ip: string): string | null {
  if (ip.startsWith('[')) {
    const m = /^\[([^[\]]+)\](?::(.*))?$/.exec(ip)
    if (!m || !m[1].includes(':')) return null
    if (m[2] !== undefined && !validPort(m[2])) return null
    return m[1]
  }
  if (ip.includes(']')) return null
  const colon = ip.indexOf(':')
  if (colon !== -1 && colon === ip.lastIndexOf(':') && ip.includes('.')) {
    return validPort(ip.slice(colon + 1)) ? ip.slice(0, colon) : null
  }
  return ip
}

/**
 * The part of a rate-limit key that identifies a client address. IPv4 is kept as is; IPv6 is reduced to its /64 prefix
 * (one subscriber owns the whole /64, so the full address would give an attacker unlimited keys); IPv4-mapped IPv6
 * (`::ffff:a.b.c.d`) is the IPv4 address. Anything unparseable (or missing) is the fixed key `unknown`, so it shares one
 * bucket instead of minting a key per garbage value.
 */
export function ipBucket(ip: string | null): string {
  if (!ip) return 'unknown'
  const host = hostOf(ip)
  if (host === null) return 'unknown'
  const raw = host.split('%')[0]
  const four = ipv4(raw)
  if (four !== null) return four
  if (!raw.includes(':')) return 'unknown'
  const g = ipv6Groups(raw)
  if (g === null) return 'unknown'
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) {
    return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`
  }
  return `v6:${g.slice(0, 4).map((n) => n.toString(16)).join(':')}`
}
