import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('globals.css overscroll', () => {
  it('only disables pull-to-refresh in standalone display mode', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    const at = css.indexOf('overscroll-behavior-y: none')
    expect(at).toBeGreaterThan(-1)
    const before = css.slice(0, at)
    expect(before.lastIndexOf('@media (display-mode: standalone)')).toBeGreaterThan(before.lastIndexOf('}\n\n'))
  })
})
