import type { GroupActions } from '@/lib/groups-contract'
import { groupErrorCopy } from '@/lib/groups-copy'

/** What `join` answers when the person is already in the group. */
export const ALREADY_MEMBER_COPY = groupErrorCopy('already_member')

/** Login for a signed-out visitor, coming back to the same invitation. */
export function groupInviteLoginHref(code: string): string {
  return `/login?next=${encodeURIComponent(`/grupos/unirse/${code}`)}`
}

/**
 * The invitation page learns that the person is already a member only from the join answer (the
 * preview does not say who is in the group). The answer goes through unchanged; `onAlreadyMember`
 * lets the page swap the form for "Ya eres parte de este grupo.".
 */
export function watchAlreadyMember(join: GroupActions['join'], onAlreadyMember: () => void): GroupActions['join'] {
  return async (code, habit) => {
    const result = await join(code, habit)
    if (!result.ok && result.error === ALREADY_MEMBER_COPY) onAlreadyMember()
    return result
  }
}
