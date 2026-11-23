import { isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { GoalView } from '@/components/GoalCard'
import type { GoalsResult } from '@/lib/goals-data'
import { fakeSupabase } from './support/fake-supabase'

const state = { result: { ok: true, goals: [] } as GoalsResult }

vi.mock('@/lib/viewer', () => ({
  getViewer: async () => ({ id: 'u1', timezone: 'America/Santiago', deletedAt: null }),
  viewerMissingDestination: async () => '/bienvenida',
}))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => fakeSupabase(() => ({ data: [] })).client }))
vi.mock('@/lib/goals-data', () => ({ loadGoalsResult: async () => state.result }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`) } }))

import { HabitGoals } from '@/components/HabitGoals'
import { LoadFailed } from '@/components/LoadFailed'
import MetasPage from '@/app/(app)/metas/page'

/** Every element type in a React element tree (function components are not rendered). */
function types(node: ReactNode, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((n) => types(n, out))
  else if (isValidElement(node)) {
    out.push(node.type)
    types((node.props as { children?: ReactNode }).children, out)
  }
  return out
}
const texts = (node: ReactNode): string[] =>
  Array.isArray(node)
    ? node.flatMap(texts)
    : isValidElement(node)
      ? texts((node.props as { children?: ReactNode }).children)
      : typeof node === 'string'
        ? [node]
        : []

const GOAL: GoalView = { id: 'g1', title: 'Correr', kind: 'weekly', current: 0, target: 3, status: 'in_progress', color: 'sage', progressLabel: '0 de 3' } as unknown as GoalView

beforeEach(() => {
  state.result = { ok: true, goals: [GOAL] }
})

describe('Metas', () => {
  test('a failed goals read shows LoadFailed, not goal cards with zero progress', async () => {
    state.result = { ok: false, goals: [GOAL] }
    const tree = await MetasPage()
    const t = types(tree)
    expect(t).toContain(LoadFailed)
    expect(texts(tree).join(' ')).not.toContain('Aún no tienes metas')
    expect(t.some((x) => (x as { name?: string }).name === 'GoalCard')).toBe(false)
  })

  test('a failed read with nothing built is not "no goals" either', async () => {
    state.result = { ok: false, goals: [] }
    const tree = await MetasPage()
    expect(types(tree)).toContain(LoadFailed)
    expect(texts(tree).join(' ')).not.toContain('Aún no tienes metas')
  })

  test('a good read still shows the goals and no retry line', async () => {
    const tree = await MetasPage()
    expect(types(tree)).not.toContain(LoadFailed)
    expect(types(tree).some((x) => (x as { name?: string }).name === 'GoalCard')).toBe(true)
  })
})

describe('Habit detail goals block', () => {
  test('a failed read shows LoadFailed pointing back at the habit', () => {
    const tree = HabitGoals({ result: { ok: false, goals: [GOAL] }, retryHref: '/habitos/h1' })
    expect(types(tree)).toContain(LoadFailed)
    expect(types(tree).some((x) => (x as { name?: string }).name === 'GoalCard')).toBe(false)
  })

  test('no goals renders nothing; goals render their cards', () => {
    expect(HabitGoals({ result: { ok: true, goals: [] }, retryHref: '/habitos/h1' })).toBeNull()
    const tree = HabitGoals({ result: { ok: true, goals: [GOAL] }, retryHref: '/habitos/h1' })
    expect(types(tree).some((x) => (x as { name?: string }).name === 'GoalCard')).toBe(true)
  })
})
