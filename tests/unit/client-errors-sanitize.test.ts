import { describe, expect, it } from 'vitest'
import { MAX_MESSAGE, MAX_STACK, redact, sanitizeMessage, sanitizePath, sanitizeStack } from '@/lib/client-errors/sanitize'

describe('redact', () => {
  it('redacts emails', () => {
    expect(redact('failed for ana.perez+x@mail.example.com today')).toBe('failed for [email] today')
  })
  it('redacts JWTs and bearer tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    expect(redact(`token ${jwt} bad`)).toBe('token [token] bad')
    expect(redact('Authorization: Bearer abc123def456')).toBe('Authorization: Bearer [token]')
  })
  it('redacts long hex runs but keeps short ones', () => {
    expect(redact('id 0123456789abcdef0123456789abcdef01 end')).toBe('id [hex] end')
    expect(redact('code 0xdeadbeef ok')).toBe('code 0xdeadbeef ok')
  })
  it('redacts long base64/url-safe runs', () => {
    expect(redact('key QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm8= end')).toBe('key [token] end')
    expect(redact('a normal sentence with words')).toBe('a normal sentence with words')
  })
  it('drops query strings and fragments from URLs, keeping the path', () => {
    expect(redact('GET https://app.example.com/api/x?token=abc&u=1#frag failed')).toBe('GET https://app.example.com/api/x failed')
    expect(redact('at https://a.com/_next/c.js:1:2 (https://a.com/_next/c.js?v=3:1:2)')).toBe(
      'at https://a.com/_next/c.js:1:2 (https://a.com/_next/c.js:1:2)',
    )
  })
})

describe('truncation', () => {
  it('caps message at 1000 and stack at 4000', () => {
    expect(MAX_MESSAGE).toBe(1000)
    expect(MAX_STACK).toBe(4000)
    expect(sanitizeMessage('x '.repeat(2000)).length).toBeLessThanOrEqual(1000)
    expect(sanitizeStack('a b\n'.repeat(5000))!.length).toBeLessThanOrEqual(4000)
  })
  it('stack is null when empty or missing', () => {
    expect(sanitizeStack(undefined)).toBeNull()
    expect(sanitizeStack('   ')).toBeNull()
  })
  it('redacts before it truncates (a secret cut in half must not survive)', () => {
    const msg = `${'a '.repeat(495)}me@mail.com`
    expect(sanitizeMessage(msg)).not.toContain('@')
  })
})

describe('sanitizePath', () => {
  it('keeps only the path', () => {
    expect(sanitizePath('/habitos/123?x=1#h')).toBe('/habitos/123')
    expect(sanitizePath('https://app.example.com/perfil?token=zz')).toBe('/perfil')
  })
  it('collapses uuids and usernames', () => {
    expect(sanitizePath('/habitos/3f2b8c1e-1111-4222-8333-444455556666')).toBe('/habitos/:id')
    expect(sanitizePath('/@pau_koh')).toBe('/@:user')
  })
  it('falls back to / for junk and caps the length', () => {
    expect(sanitizePath('nope')).toBe('/')
    expect(sanitizePath(undefined)).toBe('/')
    expect(sanitizePath(`/${'a'.repeat(500)}`).length).toBeLessThanOrEqual(200)
  })
})
