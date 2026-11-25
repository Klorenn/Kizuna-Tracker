import { describe, expect, it } from 'vitest'
import { firstFrame, fingerprint } from '@/lib/client-errors/fingerprint'

const STACK = 'TypeError: x is undefined\n    at foo (https://a.com/_next/static/c.js:10:20)\n    at bar (https://a.com/_next/static/d.js:1:2)'

describe('firstFrame', () => {
  it('takes the first at-line without line and column', () => {
    expect(firstFrame(STACK)).toBe('at foo (https://a.com/_next/static/c.js)')
  })
  it('understands the Firefox/Safari format', () => {
    expect(firstFrame('foo@https://a.com/c.js:10:20\nbar@https://a.com/d.js:1:2')).toBe('foo@https://a.com/c.js')
  })
  it('is empty without a stack', () => {
    expect(firstFrame(null)).toBe('')
    expect(firstFrame('TypeError: nothing here')).toBe('')
  })
})

describe('fingerprint', () => {
  it('is stable and 32 hex chars', () => {
    const a = fingerprint({ kind: 'error', message: 'boom', stack: STACK })
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(fingerprint({ kind: 'error', message: 'boom', stack: STACK })).toBe(a)
  })
  it('ignores line/column shifts', () => {
    const moved = STACK.replace('10:20', '11:5')
    expect(fingerprint({ kind: 'error', message: 'boom', stack: moved })).toBe(fingerprint({ kind: 'error', message: 'boom', stack: STACK }))
  })
  it('differs by kind, message and first frame', () => {
    const base = fingerprint({ kind: 'error', message: 'boom', stack: STACK })
    expect(fingerprint({ kind: 'react', message: 'boom', stack: STACK })).not.toBe(base)
    expect(fingerprint({ kind: 'error', message: 'bam', stack: STACK })).not.toBe(base)
    expect(fingerprint({ kind: 'error', message: 'boom', stack: STACK.replace('foo', 'baz') })).not.toBe(base)
  })
  it('works without a stack', () => {
    expect(fingerprint({ kind: 'server', message: 'digest 123', stack: null })).toMatch(/^[0-9a-f]{32}$/)
  })
})
