import { createHash, randomBytes } from 'node:crypto'

/** "kzw_" and 32 random bytes in base64url (43 characters). The plaintext is shown once and never stored or logged. */
export const WIDGET_TOKEN_RE = /^kzw_[A-Za-z0-9_-]{43}$/

export function generateWidgetToken(): string {
  return `kzw_${randomBytes(32).toString('base64url')}`
}

/** sha256 hex: what widget_tokens.token_hash holds. */
export function hashWidgetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** The token of an `Authorization: Bearer kzw_...` header, exactly that shape, else null. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length)
  return WIDGET_TOKEN_RE.test(token) ? token : null
}
