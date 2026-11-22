export type DeletableTable = 'goals' | 'checkin_items' | 'checkins' | 'habit_items' | 'habits'

export interface DeleteAccountDeps {
  /** Object paths (full, bucket-relative) under `prefix` in `bucket`; non-recursive like Storage's list. */
  listObjects(bucket: string, prefix: string): Promise<string[]>
  removeObjects(bucket: string, paths: string[]): Promise<void>
  /** Deletes the user's rows. The adapter keeps whatever a challenge still references (see delete-account-deps). */
  deleteRows(table: DeletableTable, userId: string): Promise<void>
  /** Cancels proposed and active challenges (a DB trigger stamps cancelled_at; ended periods still bill). */
  cancelChallenges(userId: string): Promise<void>
  /** Friendships, invites, notifications and push subscriptions. */
  purgeSocial(userId: string): Promise<void>
  scrubProfile(
    userId: string,
    patch: {
      username: string
      first_name: string
      last_name: string
      birth_date: null
      avatar_path: null
      deleted_at: string
    },
  ): Promise<void>
  /** Signs the user out everywhere (global scope). Best effort: the ban below also stops refreshes. */
  revokeSessions(userId: string): Promise<void>
  /** Blocks login, frees the email and clears every signup metadata key. */
  banAndFreeEmail(userId: string, freedEmail: string): Promise<void>
}

/**
 * Soft delete: scrubs personal data, blocks login and frees the email. Debts are never
 * touched, so they survive and show "Cuenta eliminada". Blocking login goes last: until
 * then a retry is still possible (every step is idempotent).
 */
export async function deleteAccountWith(deps: DeleteAccountDeps, userId: string, now: Date): Promise<void> {
  const proofs = [
    ...(await deps.listObjects('proofs', userId)),
    ...(await deps.listObjects('proofs', `${userId}/items`)),
  ]
  if (proofs.length > 0) await deps.removeObjects('proofs', proofs)
  await deps.removeObjects('avatars', [`${userId}.jpg`])

  await deps.cancelChallenges(userId)
  for (const table of ['goals', 'checkin_items', 'checkins', 'habit_items', 'habits'] as const) {
    await deps.deleteRows(table, userId)
  }
  await deps.purgeSocial(userId)
  await deps.scrubProfile(userId, {
    // `deleted_` + 12 hex chars = 20, the username limit; re-running writes the same value
    username: `deleted_${userId.replace(/-/g, '').slice(0, 12)}`,
    first_name: 'Cuenta',
    last_name: 'eliminada',
    birth_date: null,
    avatar_path: null,
    deleted_at: now.toISOString(),
  })
  await deps.revokeSessions(userId)
  await deps.banAndFreeEmail(userId, `deleted-${userId}@invalid.kizuna`)
}
