import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { DELETE_ORDER, deleteAccountWith, type DeleteAccountDeps } from '@/lib/delete-account'

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
    async revokeSessions(userId) {
      log(`revoke:${userId}`)
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

  test('borra registros detallados (incluidos tiempo, series, cantidad y distancia), peso, goals, checkin_items, checkins, habit_items y habits en ese orden, nunca debts', async () => {
    const { deps, calls } = fake()
    await deleteAccountWith(deps, UID, NOW)
    const deleted = calls.filter((c) => c.startsWith('delete:')).map((c) => c.split(':')[1])
    expect(deleted).toEqual([
      'workout_sets',
      'workout_sessions',
      'reading_entries',
      'books',
      'exercises',
      'pomodoro_blocks',
      'time_entries',
      'watch_entries',
      'media_items',
      'quantity_entries',
      'cardio_entries',
      'body_weights',
      'goals',
      'checkin_items',
      'checkins',
      'habit_items',
      'habits',
    ])
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
      username: 'deleted_12345678aaaa',
      first_name: 'Cuenta',
      last_name: 'eliminada',
      birth_date: null,
      avatar_path: null,
      height_cm: null,
      deleted_at: NOW.toISOString(),
    })
    expect(calls).toContain(`ban:${UID}:deleted-${UID}@invalid.kizuna`)
  })

  test('revoca sesiones justo antes de bloquear', async () => {
    const { deps, calls } = fake()
    await deleteAccountWith(deps, UID, NOW)
    expect(calls.slice(-2)).toEqual([`revoke:${UID}`, `ban:${UID}:deleted-${UID}@invalid.kizuna`])
  })

  test('el perfil y el login se bloquean al final', async () => {
    const { deps, calls } = fake()
    await deleteAccountWith(deps, UID, NOW)
    expect(calls.at(-1)!.startsWith('ban:')).toBe(true)
  })

  test('DELETE_ORDER cubre todas las tablas de 0018 y los hijos van antes que los padres', () => {
    const sql = readFileSync('supabase/migrations/0018_v4_logs.sql', 'utf8')
    const created = [...sql.matchAll(/create table public\.(\w+)\s*\(/g)].map((m) => m[1])
    expect(created.length).toBeGreaterThanOrEqual(6)
    for (const t of created) expect(DELETE_ORDER).toContain(t)
    // a table's foreign keys to other tables of the list must come later in the order
    for (const m of sql.matchAll(/create table public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      for (const ref of m[2].matchAll(/references public\.(\w+)/g)) {
        const parent = ref[1]
        if (!(DELETE_ORDER as readonly string[]).includes(parent)) continue
        expect(DELETE_ORDER.indexOf(m[1] as never), `${m[1]} before ${parent}`).toBeLessThan(
          DELETE_ORDER.indexOf(parent as never),
        )
      }
    }
  })

  test('el adaptador borra por user_id todas las tablas de 0018 (OWN_ROWS)', async () => {
    const { OWN_ROWS } = await import('@/lib/delete-account-deps')
    const sql = readFileSync('supabase/migrations/0018_v4_logs.sql', 'utf8')
    const created = [...sql.matchAll(/create table public\.(\w+)\s*\(/g)].map((m) => m[1])
    for (const t of created) expect(OWN_ROWS.has(t as never), `${t} in OWN_ROWS`).toBe(true)
    // every table of DELETE_ORDER except the two kept-aware ones is deleted by user_id
    for (const t of DELETE_ORDER) if (t !== 'checkins' && t !== 'habits') expect(OWN_ROWS.has(t), t).toBe(true)
  })
})
