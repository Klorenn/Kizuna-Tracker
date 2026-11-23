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
 * An invitation lookup behind an attempt limiter. `blocked` is a check-only call (true = over the limit): when it blocks,
 * nothing is looked up. A code that works is never recorded; one that does not (null) is recorded, so only wrong
 * guesses count. If the limiter itself fails the lookup still runs (a valid code keeps working), but an unknown code is then
 * the generic failure, not "gone" (fail closed), and nothing is recorded. Never throws.
 */
export async function limitedInviteLookup<T>(deps: {
  blocked: () => Promise<boolean>
  lookup: () => Promise<{ ok: true; data: T | null } | { ok: false }>
  record: () => Promise<void>
}): Promise<InviteOutcome<T>> {
  let limiterWorks = true
  try {
    if (await deps.blocked()) return { kind: 'blocked' }
  } catch {
    limiterWorks = false
  }
  let result: { ok: true; data: T | null } | { ok: false }
  try {
    result = await deps.lookup()
  } catch {
    return { kind: 'failed' }
  }
  if (!result.ok) return { kind: 'failed' }
  if (result.data !== null) return { kind: 'found', data: result.data }
  if (!limiterWorks) return { kind: 'failed' }
  try {
    await deps.record()
  } catch {
    // a failed count must not change what the person sees
  }
  return { kind: 'gone' }
}
