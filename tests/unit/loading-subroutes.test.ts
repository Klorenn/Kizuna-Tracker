import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { SimpleLoading } from '@/components/ui/SkeletonSimple'

// The list-shaped skeletons (resumen, habit detail) must not show on forms, editors and drill-downs.
const APP = join(process.cwd(), 'src/app/(app)')
const SUBROUTES = [
  'habitos/nuevo',
  ...['editar', 'lectura', 'tiempo', 'visto', 'entrenamiento', 'foto', 'pomodoro', 'distancia'].map((s) => `habitos/[id]/${s}`),
  ...['cantidad', 'distancia', 'ejercicio', 'gimnasio', 'lectura', 'peso', 'series', 'tiempo'].map((s) => `resumen/${s}`),
]

describe('sub-route loading files', () => {
  test.each(SUBROUTES)('%s has its own neutral loading file', (route) => {
    const file = join(APP, route, 'loading.tsx')
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('SkeletonSimple')
  })

  test('the neutral skeleton is a header line and two faint blocks, busy and still under reduced motion', () => {
    const out = renderToStaticMarkup(createElement(SimpleLoading))
    expect(out).toContain('aria-busy="true"')
    expect(out).toContain('motion-reduce:animate-none')
    expect((out.match(/<div class="relative overflow-hidden rounded-lg border/g) ?? []).length).toBe(2)
    for (const m of out.matchAll(/\bbg-([a-z-]+)(?:\/\d+)?/g)) expect(['line', 'surface']).toContain(m[1])
  })
})
