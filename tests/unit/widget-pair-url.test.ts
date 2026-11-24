import { describe, expect, it } from 'vitest'
import { widgetPairIntentUrl } from '@/domain/widget-pair-url'

describe('widgetPairIntentUrl', () => {
  const url = widgetPairIntentUrl('ABCD-EFGH')
  it('es un intent explícito al paquete de la app', () => {
    expect(url.startsWith('intent://widget/pair?code=ABCD-EFGH#Intent;')).toBe(true)
    expect(url).toContain('scheme=kizuna;')
    expect(url).toContain('package=com.kizunatracker.app;')
    expect(url.endsWith(';end')).toBe(true)
  })
  it('lleva el fallback del navegador codificado', () => {
    expect(url).toContain(
      `S.browser_fallback_url=${encodeURIComponent('https://kizuna-tracker.vercel.app/perfil/ajustes#widget')};`,
    )
  })
  it('codifica el código', () => {
    expect(widgetPairIntentUrl('a&b#c')).toContain('code=a%26b%23c#Intent')
  })
})
