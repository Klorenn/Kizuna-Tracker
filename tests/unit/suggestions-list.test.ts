import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A minimal hook store: state survives between renders of the same component, like a mounted one.
const store: unknown[] = []
let cursor = 0
vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>()
  return {
    ...actual,
    useState: <T,>(init: T) => {
      const i = cursor++
      if (!(i in store)) store[i] = init
      return [store[i] as T, (v: T) => void (store[i] = v)] as const
    },
  }
})
vi.mock('@/components/FriendActions', () => ({
  DiscoverPersonRow: ({ person }: { person: { id: string; username: string } }) =>
    actual('li', { 'data-id': person.id }, `@${person.username}`),
}))
function actual(tag: string, props: Record<string, unknown>, child: string) {
  return createElement(tag, props, child)
}

const { SuggestionsSection } = await import('@/app/(app)/amigos/SuggestionsSection')

const p = (n: number) => ({
  id: `id-${n}`,
  username: `user_${n}`,
  displayName: `Persona ${n}`,
  avatarSrc: null,
  avatarPreset: 1,
  mutualCount: 0,
  relation: 'none' as const,
  isNew: false,
})
const render = (people: ReturnType<typeof p>[] | null) => {
  cursor = 0
  return renderToStaticMarkup(createElement(SuggestionsSection, { people }))
}

beforeEach(() => {
  store.length = 0
})

describe('SuggestionsSection', () => {
  it('shows the section with its link', () => {
    const out = render([p(1), p(2)])
    expect(out).toContain('Sugerencias')
    expect(out).toContain('href="/amigos/explorar"')
  })

  it('keeps the rows on screen, in place, when a refresh brings props without them', () => {
    const first = render([p(1), p(2), p(3)])
    const after = render([p(9)]) // the server no longer lists 1 and 2 (they now have a pending request)
    expect(after).toBe(first)
    expect(after.indexOf('user_1')).toBeLessThan(after.indexOf('user_2'))
    expect(after).not.toContain('user_9')
  })

  it('is not rendered when there was nobody to suggest', () => {
    expect(render([])).toBe('')
  })

  it('shows the retry line when the read failed', () => {
    const out = render(null)
    expect(out).toContain('Reintentar')
  })
})
