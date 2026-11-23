import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeSupabase, type Recorded } from './support/fake-supabase'

// A failed read of the existing entry (or of anything the editor prefills) must be the error
// state: an editor that opens empty would let the next save replace the stored log.

const state = { failing: null as ((q: Recorded) => boolean) | null, habitType: 'reading' }

vi.mock('@/lib/viewer', () => ({
  getSessionUser: async () => ({ id: 'u1', email: null }),
  getViewerProfile: async () => ({ id: 'u1', timezone: 'America/Santiago' }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () =>
    fakeSupabase((q) => {
      if (state.failing?.(q)) return { data: null, error: { message: 'boom' } }
      const single = q.calls.some((c) => c.method === 'maybeSingle')
      if (q.table === 'habits') return { data: { id: 'h1', name: 'Hábito', log_type: state.habitType, preset: null } }
      if (q.table === 'checkins') return { data: { id: 'c1' } }
      return { data: single ? null : [] }
    }).client,
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
  notFound: () => {
    throw new Error('notFound')
  },
}))

import DistanciaPage from '@/app/(app)/habitos/[id]/distancia/page'
import EntrenamientoPage from '@/app/(app)/habitos/[id]/entrenamiento/page'
import LecturaPage from '@/app/(app)/habitos/[id]/lectura/page'
import PomodoroPage from '@/app/(app)/habitos/[id]/pomodoro/page'
import TiempoPage from '@/app/(app)/habitos/[id]/tiempo/page'
import VistoPage from '@/app/(app)/habitos/[id]/visto/page'

const by = (table: string, method?: string) => (q: Recorded) =>
  q.table === table && (!method || q.calls.some((c) => c.method === method && (method !== 'eq' || true)))
const checkinEq = (table: string) => (q: Recorded) =>
  q.table === table && q.calls.some((c) => c.method === 'eq' && c.args[0] === 'checkin_id')

type Page = (p: { params: Promise<{ id: string }>; searchParams: Promise<{ fecha?: string }> }) => Promise<unknown>
const CASES: [string, Page, string, [string, (q: Recorded) => boolean][]][] = [
  ['lectura', LecturaPage as Page, 'reading', [['the existing reading', checkinEq('reading_entries')], ['the books', by('books')]]],
  ['tiempo', TiempoPage as Page, 'time', [['the existing time', checkinEq('time_entries')]]],
  ['visto', VistoPage as Page, 'watch', [['the existing entry', checkinEq('watch_entries')], ['the titles', by('media_items')]]],
  ['entrenamiento', EntrenamientoPage as Page, 'workout', [['the existing workout', checkinEq('workout_sessions')], ['the history', (q) => q.table === 'workout_sessions' && !checkinEq('workout_sessions')(q)], ['the exercises', by('exercises')]]],
  ['distancia', DistanciaPage as Page, 'cardio', [['the check-in', by('checkins')], ['the outings', by('cardio_entries')]]],
  ['pomodoro', PomodoroPage as unknown as Page, 'time', [['today\'s time', by('time_entries')]]],
]

import { isValidElement, type ReactNode } from 'react'
import { LoadFailed } from '@/components/LoadFailed'

function types(node: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((n) => types(n, out))
  else if (isValidElement(node)) {
    out.push(node.type)
    types((node.props as { children?: ReactNode }).children, out)
  }
  return out
}

const render = (page: Page) => page({ params: Promise.resolve({ id: 'h1' }), searchParams: Promise.resolve({}) })

beforeEach(() => {
  state.failing = null
})

describe.each(CASES)('%s page', (_name, page, logType, reads) => {
  test('loads when every read works', async () => {
    state.habitType = logType
    await expect(render(page)).resolves.toBeTruthy()
  })

  test.each(reads)('a failed read of %s is an error, never an empty editor', async (label, failing) => {
    state.habitType = logType
    state.failing = failing
    if (/books|titles/.test(label)) {
      // the picker lists show the retry line instead of the editor
      expect(types(await render(page))).toContain(LoadFailed)
      return
    }
    await expect(render(page)).rejects.toThrow(/read failed|failed/)
  })
})
