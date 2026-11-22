import { describe, expect, test } from 'vitest'
import { deleteAccountWith, type DeleteAccountDeps } from '@/lib/delete-account'

const UID = '12345678-aaaa-4bbb-8ccc-1234567890ab'
const NOW = new Date('2026-11-25T12:00:00Z')

function fake(files: Record<string, string[]> = {}) {
  const calls: string[] = []
  const log = (s: string) => calls.push(s)
  const removed: { bucket: string; paths: string[] }[] = []
  const deps: DeleteAccountDeps = {
    async listObjects(bucket, prefix) {
      log(`list:${bucket}:${prefix}`)
      return files[`${bucket}:${prefix}`] ?? []
    },
    async removeObjects(bucket, paths) {
      log(`remove:${bucket}`)
      removed.push({ bucket, paths })
    },
    async deleteRows(table, userId) {
      log(`delete:${table}:${userId}`)
    },
    async cancelChallenges(userId) {
      log(`cancel:${userId}`)
    },
    async purgeSocial(userId) {
      log(`social:${userId}`)
    },
    async scrubProfile(userId, patch) {
      log(`scrub:${userId}:${JSON.stringify(patch)}`)
    },
    async banAndFreeEmail(userId, email) {
      log(`ban:${userId}:${email}`)
    },
  }
  return { deps, calls, removed }
}

describe('deleteAccountWith', () => {
  test('borra fotos con prefijo del usuario (incluye items) y el avatar', async () => {
    const { deps, removed } = fake({
      [`proofs:${UID}`]: [`${UID}/a.jpg`],
      [`proofs:${UID}/items`]: [`${UID}/items/b.jpg`],
    })
    await deleteAccountWith(deps, UID, NOW)
    expect(removed).toContainEqual({ bucket: 'proofs', paths: [`${UID}/a.jpg`, `${UID}/items/b.jpg`] })
    expect(removed).toContainEqual({ bucket: 'avatars', paths: [`${UID}.jpg`] })
  })

  test('borra goals, checkin_items, checkins, habit_items y habits en ese orden, nunca debts', async () => {
    const { deps, calls } = fake()
    await deleteAccountWith(deps, UID, NOW)
    const deleted = calls.filter((c) => c.startsWith('delete:')).map((c) => c.split(':')[1])
    expect(deleted).toEqual(['goals', 'checkin_items', 'checkins', 'habit_items', 'habits'])
    expect(calls.some((c) => c.includes('debts'))).toBe(false)
  })

  test('cancela retos antes de borrar hábitos', async () => {
    const { deps, calls } = fake()
    await deleteAccountWith(deps, UID, NOW)
    expect(calls.indexOf(`cancel:${UID}`)).toBeLessThan(calls.indexOf(`delete:habits:${UID}`))
  })

  test('limpia el perfil y banea al usuario con correo liberado', async () => {
    const { deps, calls } = fake()
    await deleteAccountWith(deps, UID, NOW)
    const scrub = calls.find((c) => c.startsWith('scrub:'))!
    expect(JSON.parse(scrub.slice(`scrub:${UID}:`.length))).toEqual({
      username: 'deleted_12345678',
      first_name: 'Cuenta',
      last_name: 'eliminada',
      birth_date: null,
      avatar_path: null,
      deleted_at: NOW.toISOString(),
    })
    expect(calls).toContain(`ban:${UID}:deleted-${UID}@invalid.kizuna`)
  })

  test('el perfil y el login se bloquean al final', async () => {
    const { deps, calls } = fake()
    await deleteAccountWith(deps, UID, NOW)
    expect(calls.at(-1)!.startsWith('ban:')).toBe(true)
  })
})
