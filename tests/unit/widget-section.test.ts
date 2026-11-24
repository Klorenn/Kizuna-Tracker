import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(app)/perfil/actions', () => ({ createWidgetCode: vi.fn(), revokeWidgetDevice: vi.fn() }))
const { WidgetSection } = await import('@/app/(app)/perfil/ajustes/WidgetSection')

const dev = (n: number) => ({ id: `id${n}`, label: `Pixel ${n}`, meta: 'Conectado hace 4 días · sin uso todavía' })
const render = (devices: ReturnType<typeof dev>[]) => renderToStaticMarkup(createElement(WidgetSection, { devices }))

describe('WidgetSection', () => {
  it('sin dispositivos: botón activo y nota de versión', () => {
    const html = render([])
    expect(html).toContain('Conectar widget')
    expect(html).not.toContain('disabled=""')
    expect(html).toMatch(/1\.0\.1/)
    expect(html).not.toContain('Desconectar')
  })
  it('lista los dispositivos con "Desconectar"', () => {
    const html = render([dev(1), dev(2)])
    expect(html).toContain('Pixel 1')
    expect(html).toContain('Pixel 2')
    expect(html.match(/Desconectar/g)?.length).toBeGreaterThanOrEqual(2)
  })
  it('con 3 dispositivos el botón está desactivado y explica el tope', () => {
    const html = render([dev(1), dev(2), dev(3)])
    expect(html).toContain('disabled=""')
    expect(html).toContain('3 dispositivos')
  })
})
