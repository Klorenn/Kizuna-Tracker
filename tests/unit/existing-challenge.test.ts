import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExistingChallengeNotice } from '@/components/ExistingChallengeNotice'
import { RetarAction } from '@/components/friends/RetarAction'
import { existingChallengeMessage, openChallengeByRival } from '@/lib/challenge-form'

const ME = 'me'
const row = (id: string, creator: string, rival: string, status: string) => ({
  id,
  creator_id: creator,
  rival_id: rival,
  status,
})

describe('openChallengeByRival', () => {
  it('maps the other person of every proposed or active challenge to its id', () => {
    const map = openChallengeByRival(
      [row('c1', ME, 'ana', 'proposed'), row('c2', 'beto', ME, 'active')],
      ME,
    )
    expect(map).toEqual({ ana: 'c1', beto: 'c2' })
  })

  it('ignores declined, cancelled and finished challenges', () => {
    const map = openChallengeByRival(
      [row('c1', ME, 'ana', 'declined'), row('c2', ME, 'beto', 'cancelled'), row('c3', ME, 'cami', 'finished')],
      ME,
    )
    expect(map).toEqual({})
  })

  it('keeps the first row per person (rows arrive newest first)', () => {
    const map = openChallengeByRival([row('new', ME, 'ana', 'active'), row('old', 'ana', ME, 'proposed')], ME)
    expect(map).toEqual({ ana: 'new' })
  })
})

describe('existingChallengeMessage', () => {
  it('names the person', () => {
    expect(existingChallengeMessage('ana')).toBe('Ya tienes un reto con @ana')
  })
  it('falls back without a username', () => {
    expect(existingChallengeMessage(null)).toBe('Ya tienes un reto con esta persona')
  })
})

describe('ExistingChallengeNotice', () => {
  it('shows the message and links to the existing challenge', () => {
    const html = renderToStaticMarkup(createElement(ExistingChallengeNotice, { username: 'ana', challengeId: 'c1' }))
    expect(html).toContain('Ya tienes un reto con @ana')
    expect(html).toContain('href="/retos/c1"')
    expect(html).toContain('Ver reto')
    expect(html).toContain('role="alert"')
  })
})

describe('RetarAction', () => {
  it('offers Retar towards the form when there is no open challenge', () => {
    const html = renderToStaticMarkup(createElement(RetarAction, { friendId: 'f1', openChallengeId: null }))
    expect(html).toContain('href="/retos/nuevo?amigo=f1"')
    expect(html).toContain('Retar')
    expect(html).not.toContain('Ver reto')
  })

  it('offers Ver reto towards the open challenge', () => {
    const html = renderToStaticMarkup(createElement(RetarAction, { friendId: 'f1', openChallengeId: 'c9' }))
    expect(html).toContain('href="/retos/c9"')
    expect(html).toContain('Ver reto')
    expect(html).not.toContain('/retos/nuevo')
  })
})
