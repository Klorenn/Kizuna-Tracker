import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FeedItem } from '@/components/FeedItem'
import { ActivityDays } from '@/components/friends/ActivityItem'
import type { FeedEntry } from '@/lib/feed'

const entry = (n: number, photo: boolean): FeedEntry => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  cursor: { day: '2026-11-22', at: `2026-11-22T1${n}:00:00.000Z`, id: `00000000-0000-4000-8000-00000000000${n}` },
  person: { id: 'p', username: 'ana', name: 'Ana', avatar: null, avatarPreset: 1 },
  habit: { name: 'Gimnasio', color: 'rosa' },
  copy: 'Subió su foto de Gimnasio',
  localDate: '2026-11-22',
  time: '10:00',
  hasPhoto: photo,
  photoUrl: photo ? `https://signed.test/${n}.jpg?t=1` : null,
  streak: null,
  status: null,
})

const imgs = (html: string) => [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]).filter((t) => t.includes('signed.test'))

describe('feed photo cards', () => {
  const html = renderToStaticMarkup(
    createElement(ActivityDays, { items: [entry(1, true), entry(2, true), entry(3, true)], today: '2026-11-22' }),
  )
  const photos = imgs(html)

  it('every photo decodes async and carries explicit dimensions (no layout shift)', () => {
    expect(photos).toHaveLength(3)
    for (const tag of photos) {
      expect(tag).toContain('decoding="async"')
      expect(tag).toMatch(/width="\d+"/)
      expect(tag).toMatch(/height="\d+"/)
    }
  })

  it('the first photo of the first screen stays eager, the rest are lazy', () => {
    expect(photos[0]).toContain('loading="eager"')
    expect(photos.slice(1).every((t) => t.includes('loading="lazy"'))).toBe(true)
  })

  it('a later page (continuing the previous day) is lazy from its first photo', () => {
    const later = renderToStaticMarkup(
      createElement(ActivityDays, { items: [entry(4, true)], today: '2026-11-22', continuesFrom: '2026-11-22' }),
    )
    expect(imgs(later)[0]).toContain('loading="lazy"')
  })

  it('the first photo is the first one with a photo, not the first row', () => {
    const mixed = renderToStaticMarkup(
      createElement(ActivityDays, { items: [entry(1, false), entry(2, true), entry(3, true)], today: '2026-11-22' }),
    )
    const [first, second] = imgs(mixed)
    expect(first).toContain('loading="eager"')
    expect(second).toContain('loading="lazy"')
  })

  it('challenge feed photos (FeedItem) are lazy, async and sized', () => {
    const out = renderToStaticMarkup(
      createElement(FeedItem, {
        entry: { id: 'x', who: 'Ana', habit: 'Gimnasio', icon: 'barbell', when: 'hoy', photoUrl: 'https://signed.test/9.jpg?t=1', note: null },
      }),
    )
    const [tag] = imgs(out)
    expect(tag).toContain('loading="lazy"')
    expect(tag).toContain('decoding="async"')
    expect(tag).toMatch(/width="\d+"/)
    expect(tag).toMatch(/height="\d+"/)
  })
})
