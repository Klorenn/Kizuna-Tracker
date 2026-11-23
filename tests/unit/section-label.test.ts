import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
const rule = css.slice(css.indexOf('.section-label'), css.indexOf('}', css.indexOf('.section-label')) + 1)

describe('section labels (owner: Inter, semibold, sentence case)', () => {
  it('the rule is Inter 13 / 600 with no mono, caps or tracking', () => {
    expect(rule).toContain('font-family: var(--font-sans)')
    expect(rule).toContain('font-size: 13px')
    expect(rule).toContain('font-weight: 600')
    expect(rule).toContain('line-height: 1.3')
    expect(rule).not.toMatch(/font-mono|uppercase|letter-spacing/)
  })

  it('no label is typed in capitals in the source (the DOM text is sentence case)', () => {
    const files = readdirSync(join(root, 'src'), { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => `src/${f}`)
    const caps = /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ·]{3,}$/
    const bad: string[] = []
    for (const f of files) {
      if (f.includes('/charts/')) continue
      const src = readFileSync(join(root, f), 'utf8')
      for (const m of src.matchAll(/section-label[^>]*>\s*\{?\s*([^<{}]+)/g)) {
        if (caps.test(m[1].trim().replace(/^"|"$/g, ''))) bad.push(`${f}: ${m[1].trim()}`)
      }
      for (const m of src.matchAll(/\blabel="([^"]+)"/g)) if (caps.test(m[1])) bad.push(`${f}: label=${m[1]}`)
      for (const m of src.matchAll(/"([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ·]{3,}(?: DE \d+| \d+)?)"/g)) {
        if (/(FOCO|DESCANSO|LISTO|TERMINADO|TEMPORIZADOR|CRONÓMETRO|MINUTOS)/.test(m[1])) bad.push(`${f}: ${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })
})
