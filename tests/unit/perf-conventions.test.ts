import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}
const files = walk(SRC)
const rel = (f: string) => relative(process.cwd(), f)
const read = (f: string) => readFileSync(f, 'utf8')
const isClient = (text: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text)

// The screens of Package P1: every one gets the viewer through lib/viewer (one memoised auth
// check and one profile read per request), never a second getUser + profiles read of its own.
const VIEWER_SCREENS = /src\/app\/\(app\)\/(page\.tsx|(habitos|libros|series|resumen|amigos|perfil|deudas|metas)\/.*(page|logs-view)\.tsx)$/

describe('screens read the viewer through lib/viewer', () => {
  const screens = files.filter((f) => VIEWER_SCREENS.test(rel(f)))

  test('the scan sees the screens it is meant to check', () => {
    expect(screens.length).toBeGreaterThan(20)
  })

  test.each(screens.map((f) => [rel(f), read(f)] as const))('%s makes no auth.getUser call and reads no profile row itself', (_name, text) => {
    expect(text).not.toMatch(/auth\.getUser\(/)
    expect(text).not.toMatch(/\.from\(["']profiles["']\)/)
  })
})

describe('icon imports', () => {
  test('client components import the root entry; /dist/ssr is for server components', () => {
    const offenders = files.filter((f) => isClient(read(f)) && /@phosphor-icons\/react\/dist\/ssr/.test(read(f))).map(rel)
    expect(offenders).toEqual([])
  })
})
