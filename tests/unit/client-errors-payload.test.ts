import { describe, expect, it } from 'vitest'
import { MAX_BODY_BYTES, parseUa, validatePayload } from '@/lib/client-errors/payload'

const ok = { kind: 'error', message: 'boom', stack: 'at x (https://a.com/c.js:1:2)', path: '/perfil?x=1' }

describe('validatePayload', () => {
  it('accepts a minimal and a full payload', () => {
    expect(validatePayload({ kind: 'react', message: 'm' })).toEqual({ ok: true, value: { kind: 'react', message: 'm', stack: null, path: '/' } })
    const r = validatePayload(ok)
    expect(r.ok && r.value).toMatchObject({ kind: 'error', path: '/perfil' })
  })
  it('accepts all four kinds and nothing else', () => {
    for (const kind of ['error', 'unhandledrejection', 'react', 'server']) expect(validatePayload({ kind, message: 'm' }).ok).toBe(true)
    expect(validatePayload({ kind: 'other', message: 'm' }).ok).toBe(false)
  })
  it('rejects non-objects, arrays, missing or empty message, wrong types', () => {
    for (const bad of [null, 'x', 1, [], {}, { kind: 'error' }, { kind: 'error', message: '' }, { kind: 'error', message: 5 }, { ...ok, stack: 5 }, { ...ok, path: {} }]) {
      expect(validatePayload(bad).ok).toBe(false)
    }
  })
  it('rejects unknown keys (strict), in particular a user id', () => {
    expect(validatePayload({ ...ok, userId: 'x' }).ok).toBe(false)
    expect(validatePayload({ ...ok, user_id: 'x' }).ok).toBe(false)
  })
  it('rejects absurdly long fields instead of storing them', () => {
    expect(validatePayload({ ...ok, message: 'a'.repeat(20000) }).ok).toBe(false)
  })
  it('redacts and truncates what it keeps', () => {
    const r = validatePayload({ kind: 'error', message: 'mail me@a.com', stack: 'x'.repeat(7000) })
    expect(r.ok && r.value.message).toBe('mail [email]')
    expect(r.ok && r.value.stack!.length).toBeLessThanOrEqual(4000)
  })
  it('exposes an 8 KB body limit', () => {
    expect(MAX_BODY_BYTES).toBe(8192)
  })
})

describe('parseUa', () => {
  it('detects the native shell and its major', () => {
    expect(parseUa('Mozilla/5.0 (Linux; Android 14) KizunaNative/12')).toEqual({ uaKind: 'native', appVersion: '12' })
  })
  it('is browser otherwise', () => {
    expect(parseUa('Mozilla/5.0 Chrome/120')).toEqual({ uaKind: 'browser', appVersion: null })
    expect(parseUa(null)).toEqual({ uaKind: 'browser', appVersion: null })
  })
})
