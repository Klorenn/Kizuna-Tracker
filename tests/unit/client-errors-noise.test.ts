import { describe, expect, it } from 'vitest'
import { isNoise } from '@/lib/client-errors/noise'

describe('isNoise', () => {
  it('ignores browser-extension stacks', () => {
    for (const s of ['chrome-extension://abc/x.js:1:1', 'moz-extension://abc/x.js', 'safari-web-extension://a/b.js', 'safari-extension://a/b.js'])
      expect(isNoise({ message: 'x', stack: `Error: x\n at f (${s})` })).toBe(true)
  })
  it('ignores ResizeObserver loop errors', () => {
    expect(isNoise({ message: 'ResizeObserver loop limit exceeded' })).toBe(true)
    expect(isNoise({ message: 'ResizeObserver loop completed with undelivered notifications.' })).toBe(true)
  })
  it('ignores aborted fetches', () => {
    expect(isNoise({ message: 'AbortError: The user aborted a request.' })).toBe(true)
    expect(isNoise({ message: 'signal is aborted without reason' })).toBe(true)
    expect(isNoise({ message: 'The operation was aborted.' })).toBe(true)
  })
  it('ignores opaque cross-origin "Script error."', () => {
    expect(isNoise({ message: 'Script error.' })).toBe(true)
  })
  it('ignores "Load failed" only while navigating', () => {
    expect(isNoise({ message: 'Load failed', navigating: true })).toBe(true)
    expect(isNoise({ message: 'TypeError: Load failed', navigating: true })).toBe(true)
    expect(isNoise({ message: 'Load failed', navigating: false })).toBe(false)
    expect(isNoise({ message: 'Load failed' })).toBe(false)
  })
  it('keeps real errors', () => {
    expect(isNoise({ message: "Cannot read properties of undefined (reading 'x')", stack: 'at f (https://app/_next/c.js:1:1)' })).toBe(false)
  })
})
