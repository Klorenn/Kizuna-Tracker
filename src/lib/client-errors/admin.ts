/** Owner-only gate: ADMIN_USER_IDS is a comma list of auth user ids, read from the environment of the server only. */
export function isAdminUser(userId: string | null | undefined, allowlist: string | undefined): boolean {
  if (!userId || !allowlist) return false
  return allowlist
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .includes(userId)
}

export type ErrorRowView = {
  fingerprint: string
  kind: string
  message: string
  stack: string | null
  url_path: string
  ua_kind: string
  release: string | null
  count: number
  last_seen_at: string
}
export type ErrorGroup = {
  fingerprint: string
  kind: string
  message: string
  stack: string | null
  path: string
  uaKind: string
  release: string | null
  count: number
  lastSeen: string
}

/** Hour buckets -> one entry per fingerprint: counts summed, the latest sighting wins the other fields. Newest first. */
export function groupErrors(rows: ErrorRowView[]): ErrorGroup[] {
  const by = new Map<string, ErrorGroup>()
  for (const r of rows) {
    const g = by.get(r.fingerprint)
    if (!g) {
      by.set(r.fingerprint, { fingerprint: r.fingerprint, kind: r.kind, message: r.message, stack: r.stack, path: r.url_path, uaKind: r.ua_kind, release: r.release, count: r.count, lastSeen: r.last_seen_at })
      continue
    }
    g.count += r.count
    if (r.last_seen_at > g.lastSeen) {
      g.lastSeen = r.last_seen_at
      g.release = r.release
      g.path = r.url_path
      g.uaKind = r.ua_kind
    }
  }
  return [...by.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0))
}
