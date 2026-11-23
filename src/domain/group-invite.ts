import { inviteUrlPath, normalizeInviteCode } from '@/domain/groups'

export const TOO_MANY_COPY = 'Demasiados intentos. Prueba de nuevo en unos minutos.'

/**
 * What `/g/[code]` does with the segment it was given: the canonical code renders; a variant (lower case, a hyphen,
 * spaces) goes to the canonical path (same origin, and that path decides "render", so it cannot loop); anything else is
 * the invalid-link view. The segment never reaches the database in any other form.
 */
export function inviteRouteDecision(
  typed: string,
): { kind: 'render'; code: string } | { kind: 'redirect'; to: string } | { kind: 'invalid' } {
  const code = normalizeInviteCode(typed)
  if (code === null) return { kind: 'invalid' }
  return code === typed ? { kind: 'render', code } : { kind: 'redirect', to: inviteUrlPath(code) }
}

/** The group page is a 404 as soon as any of its reads says "not found" (a stranger gets the same answer whichever read comes first). */
export function groupPageNotFound(reads: readonly { ok: boolean; notFound?: true }[]): boolean {
  return reads.some((r) => !r.ok && r.notFound === true)
}

export type InviteOutcome<T> =
  | { kind: 'blocked' }
  | { kind: 'found'; data: T }
  | { kind: 'gone' }
  | { kind: 'failed' }

/**
 * An invitation lookup whose limiter and lookup are ONE database call (`group_invite_lookup`), so parallel requests cannot
 * all pass a check before any of them is counted. `limited` means the key already has its failed lookups in the window (no
 * lookup was done); a null preview is a code that is not a valid invitation (the database counted it); a preview is a valid
 * one (nothing counted). If the call fails, throws or answers something unreadable the outcome is `failed` for ANY code:
 * there is never a preview, and never "gone", without the limiter's answer. Never throws.
 */
export async function limitedInviteLookup<T>(deps: {
  lookup: () => Promise<{ ok: true; limited: boolean; data: T | null } | { ok: false }>
}): Promise<InviteOutcome<T>> {
  let result: { ok: true; limited: boolean; data: T | null } | { ok: false }
  try {
    result = await deps.lookup()
  } catch {
    return { kind: 'failed' }
  }
  if (!result.ok) return { kind: 'failed' }
  if (result.limited) return { kind: 'blocked' }
  return result.data !== null ? { kind: 'found', data: result.data } : { kind: 'gone' }
}
