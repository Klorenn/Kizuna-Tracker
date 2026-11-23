import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = (p: string) => readFileSync(p, 'utf8')

describe('error boundaries', () => {
  it('global-error brings its own html/body and follows the system theme like the root layout does for "system"', () => {
    const s = src('src/app/global-error.tsx')
    expect(s).toMatch(/<html[^>]*lang="es"[^>]*data-theme="system"/)
    expect(s).toMatch(/<html[^>]*data-color="indigo"/) // no cookie here: the default colour
    expect(s).toMatch(/<body/)
  })
  it('the retry of both boundaries refetches the server components, not only the client tree', () => {
    expect(src('src/app/error.tsx')).toMatch(/router\.refresh\(\)/)
    expect(src('src/app/global-error.tsx')).toMatch(/location\.reload\(\)/)
  })
  it('both use the same copy', () => {
    const copy = 'Algo salió mal. Inténtalo de nuevo en unos minutos.'
    expect(src('src/app/error.tsx')).toContain(copy)
    expect(src('src/app/global-error.tsx')).toContain(copy)
  })
})
