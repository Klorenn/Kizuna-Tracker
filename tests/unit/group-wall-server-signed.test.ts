import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const browserSign = vi.fn()
vi.mock('@/lib/supabase/client', () => ({ createBrowserClient: () => ({ storage: { from: browserSign } }) }))

const { WallFeed } = await import('@/components/groups/detail/WallFeed')

describe('WallFeed with server-signed URLs', () => {
  it('first render (SSR) already carries the signed photo URL, no loading placeholder', () => {
    const wall = {
      items: [
        { userId: 'u', username: 'ana', displayName: 'Ana', avatarPath: null, avatarPreset: null, checkinId: '1', localDate: '2026-11-23', photoPath: 'u/1.jpg', createdAt: '2026-11-23T10:00:00Z' },
      ],
      next: null,
    }
    const h = renderToStaticMarkup(
      createElement(WallFeed, {
        groupId: 'g1', wall, today: '2026-11-23', actions: { loadMoreWall: vi.fn() }, retryHref: '/grupos/g1', color: 'oliva',
        signedUrls: { 'u/1.jpg': 'https://signed.test/1.jpg' }, signedAt: Date.now(),
      } as never),
    )
    expect(h).toContain('src="https://signed.test/1.jpg"')
    expect(h).not.toContain('aria-busy="true"')
  })
})

describe('WallFeed with an expired server seed', () => {
  it('a seed older than the reuse window is not trusted on first render (placeholder, browser re-signs)', () => {
    const wall = {
      items: [
        { userId: 'u', username: 'ana', displayName: 'Ana', avatarPath: null, avatarPreset: null, checkinId: '9', localDate: '2026-11-23', photoPath: 'u/9.jpg', createdAt: '2026-11-23T10:00:00Z' },
      ],
      next: null,
    }
    const h = renderToStaticMarkup(
      createElement(WallFeed, {
        groupId: 'g1', wall, today: '2026-11-23', actions: { loadMoreWall: vi.fn() }, retryHref: '/grupos/g1', color: 'oliva',
        signedUrls: { 'u/9.jpg': 'https://signed.test/9.jpg' }, signedAt: Date.now() - 400_000,
      } as never),
    )
    expect(h).not.toContain('https://signed.test/9.jpg')
    expect(h).toContain('aria-busy="true"')
  })
})
