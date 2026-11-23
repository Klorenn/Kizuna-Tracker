import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(app)/perfil/actions', () => ({ setDiscoverable: vi.fn() }))
const { DiscoverableSwitch } = await import('@/app/(app)/perfil/ajustes/DiscoverableSwitch')

const html = (initial: boolean) => renderToStaticMarkup(createElement(DiscoverableSwitch, { initial }))

describe('DiscoverableSwitch', () => {
  it('is a labelled switch with its state and the exact helper copy', () => {
    const on = html(true)
    expect(on).toContain('role="switch"')
    expect(on).toContain('aria-checked="true"')
    expect(on).toContain('aria-label="Aparecer en sugerencias y en Explorar"')
    expect(on).toContain('Si lo apagas, no apareces en esas listas. Igual pueden agregarte con tu @usuario o tu enlace de invitación.')
    expect(html(false)).toContain('aria-checked="false"')
  })

  it('has a 44 px target', () => {
    expect(html(true)).toMatch(/h-11/)
  })

  it('reuses ui/Toggle: no copy of its knob markup or arbitrary values', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(app)/perfil/ajustes/DiscoverableSwitch.tsx'), 'utf8')
    expect(src).toContain('@/components/ui/Toggle')
    expect(src).not.toMatch(/\[[0-9.]+(px|rem|ms)\]/)
  })
})

describe('new discovery code uses no arbitrary values', () => {
  const files = [
    'src/components/PersonRow.tsx',
    'src/components/FriendActions.tsx',
    'src/app/(app)/amigos/SuggestionsSection.tsx',
    'src/app/(app)/amigos/PeopleSearch.tsx',
    'src/app/(app)/amigos/explorar/ExploreList.tsx',
    'src/app/(app)/amigos/explorar/page.tsx',
  ]
  it.each(files)('%s', (f) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8')
    // AddFriendButton predates this task and keeps its own error line
    // the accept / reject round buttons keep the exact look of FriendRequestRow (1.5 px border, 120 ms)
    const own = (f.endsWith('FriendActions.tsx') ? src.slice(0, src.indexOf('/** "Agregar amigo"')) : src)
      .replaceAll('border-[1.5px]', '')
      .replaceAll('duration-[120ms]', '')
    expect(own).not.toMatch(/\b[a-z-]+-\[[0-9.]+(px|rem|ms)\]/)
  })
})
