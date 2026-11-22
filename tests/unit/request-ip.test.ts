import { describe, expect, it } from 'vitest'
import { clientIp } from '@/lib/request-ip'

const h = (o: Record<string, string>) => new Headers(o)

describe('clientIp', () => {
  it('prefers x-vercel-forwarded-for', () => {
    expect(
      clientIp(h({ 'x-vercel-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' })),
    ).toBe('1.1.1.1')
  })
  it('then x-real-ip', () => {
    expect(clientIp(h({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' }))).toBe('2.2.2.2')
  })
  it('then the first x-forwarded-for value', () => {
    expect(clientIp(h({ 'x-forwarded-for': ' 3.3.3.3 , 4.4.4.4' }))).toBe('3.3.3.3')
  })
  it('returns null when nothing is present or values are blank', () => {
    expect(clientIp(h({}))).toBeNull()
    expect(clientIp(h({ 'x-forwarded-for': ' , ' }))).toBeNull()
  })
  it('caps absurdly long values', () => {
    expect(clientIp(h({ 'x-real-ip': 'a'.repeat(100) }))).toBeNull()
  })
})
