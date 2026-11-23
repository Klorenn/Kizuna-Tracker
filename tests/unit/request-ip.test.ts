import { describe, expect, it } from 'vitest'
import { clientIp, ipBucket } from '@/lib/request-ip'

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

describe('ipBucket (rate-limit key part)', () => {
  it('IPv4 is unchanged', () => expect(ipBucket('203.0.113.7')).toBe('203.0.113.7'))
  it('full IPv6: the /64 prefix, normalised', () => {
    expect(ipBucket('2001:0db8:85a3:0042:1111:2222:3333:4444')).toBe('v6:2001:db8:85a3:42')
    expect(ipBucket('2001:DB8:85A3:42:ffff:ffff:ffff:ffff')).toBe('v6:2001:db8:85a3:42')
  })
  it('two addresses of one /64 share a key, another /64 does not', () => {
    expect(ipBucket('2001:db8:1:2:aaaa::1')).toBe(ipBucket('2001:db8:1:2:bbbb:cccc:dddd:eeee'))
    expect(ipBucket('2001:db8:1:3::1')).not.toBe(ipBucket('2001:db8:1:2::1'))
  })
  it('compressed (::) forms', () => {
    expect(ipBucket('2001:db8::1')).toBe('v6:2001:db8:0:0')
    expect(ipBucket('2001:db8:0:0:0:0:0:1')).toBe('v6:2001:db8:0:0')
    expect(ipBucket('::1')).toBe('v6:0:0:0:0')
    expect(ipBucket('::')).toBe('v6:0:0:0:0')
    expect(ipBucket('1:2:3:4::')).toBe('v6:1:2:3:4')
    expect(ipBucket('1::5:6:7:8')).toBe('v6:1:0:0:0')
  })
  it('IPv4-mapped IPv6 is the IPv4 address', () => {
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(ipBucket('::FFFF:cb00:7107')).toBe('203.0.113.7')
    expect(ipBucket('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7')
  })
  it('a zone id is dropped', () => expect(ipBucket('fe80::1%eth0')).toBe('v6:fe80:0:0:0'))
  it.each([null, '', 'garbage', '1.2.3', '256.1.1.1', '1.2.3.4.5', '1:2:3', '1::2::3', '12345::1', '1:2:3:4:5:6:7:8:9', 'g::1', ':1:2:3:4:5:6:7'])(
    '%j is unparseable: the fixed key',
    (v) => expect(ipBucket(v)).toBe('unknown'),
  )
})
