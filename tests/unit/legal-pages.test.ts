import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { isPublicPath } from '@/lib/supabase/public-paths'

import PrivacidadPage from '@/app/legal/privacidad/page'
import TerminosPage from '@/app/legal/terminos/page'

const text = (el: React.ReactElement) =>
  renderToStaticMarkup(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')

describe('legal pages', () => {
  it('are public', () => {
    expect(isPublicPath('/legal/terminos')).toBe(true)
    expect(isPublicPath('/legal/privacidad')).toBe(true)
  })

  it.each([
    ['terminos', TerminosPage],
    ['privacidad', PrivacidadPage],
  ])('%s shows the draft notice and a contact placeholder', (_name, Page) => {
    const t = text(Page())
    expect(t).toContain('Borrador pendiente de revisión legal')
    expect(t).toContain('[correo de contacto por definir]')
  })

  it('terms: app is not party to debts, no payments, 18+, no password recovery, delete account', () => {
    const t = text(TerminosPage())
    expect(t).toContain('no es parte de las deudas')
    expect(t).toContain('no procesa pagos')
    expect(t).toContain('No garantiza')
    expect(t).toContain('18 años')
    expect(t).toContain('no hay recuperación de contraseña')
    expect(t).toContain('borrar tu cuenta')
    expect(t).toContain('desde Perfil > Ajustes')
  })

  it('privacy: data, visibility levels, photos never public, deletion, Ley 21.719', () => {
    const t = text(PrivacidadPage())
    expect(t).toContain('fecha de nacimiento')
    expect(t).toContain('Solo yo')
    expect(t).toContain('Amigos')
    expect(t).toContain('Público')
    expect(t).toContain('Las fotos nunca son públicas')
    expect(t).toContain('nunca se muestran')
    expect(t).toContain('foto de perfil')
    expect(t).toContain('Cookies y almacenamiento del dispositivo')
    expect(t).toContain('cookie de sesión')
    expect(t).toContain('cookie llamada theme')
    expect(t).not.toContain('Más adelante')
    expect(t).toContain('desde Perfil > Ajustes')
    expect(t).toContain('cuenta eliminada')
    expect(t).toContain('Ley 21.719')
  })
})

describe('shared legal content', () => {
  it('TermsContent and PrivacyContent render the draft notice without page chrome', async () => {
    const { TermsContent } = await import('@/components/legal/TermsContent')
    const { PrivacyContent } = await import('@/components/legal/PrivacyContent')
    for (const C of [TermsContent, PrivacyContent]) {
      const t = text(C())
      expect(t).toContain('Borrador pendiente de revisión legal')
      expect(t).not.toContain('Ver los términos')
    }
  })
})
