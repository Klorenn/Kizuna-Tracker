import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

const VOSEO =
  /\b(tenés|podés|querés|sabés|debés|sos|probá|creá|revisá|volvé|elegí|escribí|agregá|intentá|mirá|usá|hacé|poné|vení)\b/i
const FORBIDDEN = /\b(apuestas?|bet|pozo)\b/i

describe('copy', () => {
  const files = walk(ROOT)
  it('scans source files', () => expect(files.length).toBeGreaterThan(0))
  it('has no voseo', () => {
    expect(files.filter((f) => VOSEO.test(readFileSync(f, 'utf8')))).toEqual([])
  })
  it('has no forbidden words', () => {
    expect(files.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))).toEqual([])
  })
})
