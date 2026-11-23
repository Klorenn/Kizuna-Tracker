import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PrivacyContent } from '@/components/legal/PrivacyContent'
import { TermsContent } from '@/components/legal/TermsContent'

const text = (el: React.ReactElement) =>
  renderToStaticMarkup(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')

describe('legal text: groups', () => {
  it('privacy: what members of a group see, from the day you join, and how it ends', () => {
    const t = text(PrivacyContent())
    expect(t).toContain('Grupos')
    expect(t).toContain('Los miembros de un grupo al que te unes ven tu nombre, tu @usuario y tu avatar')
    expect(t).toContain('los registros y las fotos del único hábito que vinculas a ese grupo')
    expect(t).toContain('desde el día en que te unes')
    expect(t).toContain('lo anterior a ese día sigue siendo privado')
    expect(t).toContain('Al salir del grupo, o si te sacan, los demás dejan de ver tus registros y fotos de inmediato')
    expect(t).toContain('Tu nombre y tu resultado en las semanas que ya se cerraron quedan en el historial del grupo')
    expect(t).not.toContain('termina de inmediato')
    expect(t).toContain('solo se entra con un enlace de invitación')
    expect(t).toContain('no aparecen en ninguna lista')
  })

  it('privacy: photos are still never public, and the friends line no longer says friends are the only ones', () => {
    const t = text(PrivacyContent())
    expect(t).toContain('Las fotos nunca son públicas')
    expect(t).not.toContain('Solo las ven tus amigos')
  })

  it('terms: groups are invitation-only, members need not be friends, what you share', () => {
    const t = text(TermsContent())
    expect(t).toContain('Grupos')
    expect(t).toContain('hasta 50 personas')
    expect(t).toContain('No hace falta que sean tus amigos')
    expect(t).toContain('solo se entra con un enlace de invitación')
    expect(t).toContain('verán tus registros y fotos de ese hábito')
    expect(t).toContain('Puedes salir cuando quieras')
  })

  it('nothing about fines or money, and none of the banned words', () => {
    const groupsOnly = (t: string) => t.slice(t.indexOf('Grupos'))
    for (const t of [text(PrivacyContent()), text(TermsContent())]) {
      expect(t.toLowerCase()).not.toMatch(/apuesta|\bbet\b|pozo/)
    }
    // the membership paragraphs only; the fine paragraph that follows is covered in deudas-fund.test.ts
    const grouped = groupsOnly(text(TermsContent()))
    const section = grouped.slice(0, grouped.indexOf('La multa de un grupo')).toLowerCase()
    expect(section).not.toMatch(/multa|dinero|deuda|fondo/)
  })
})
