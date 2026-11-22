import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const css = ['app/globals.css', 'styles/tokens.css']
  .map((f) => readFileSync(join(SRC, f), 'utf8'))
  .join('\n')
  .toUpperCase()

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('design tokens', () => {
  it.each(['#5A5AC2', '#4C4CA5', '#EFEFF9', '#2E3A5E', '#F0F0F0', '#8D8D8D', '#FDECEC', '#F6EBD8'])(
    'defines %s',
    (hex) => expect(css).toContain(hex),
  )

  it('shu appears only under components/brand', () => {
    const brand = `${sep}components${sep}brand${sep}`
    const offenders = walk(SRC).filter(
      (f) => !f.includes(brand) && readFileSync(f, 'utf8').toUpperCase().includes('#C73E2E'),
    )
    expect(offenders).toEqual([])
  })
})
