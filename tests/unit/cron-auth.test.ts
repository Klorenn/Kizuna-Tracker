import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const rpc = vi.fn()
const createAdminClient = vi.fn(() => ({ rpc }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }))

import { authorizeCronRequest } from '@/lib/cron-auth'

const HEX = 'a'.repeat(64)
const OTHER_HEX = 'b'.repeat(64)

function req(token?: string, scheme = 'Bearer') {
  const headers = new Headers()
  if (token !== undefined) headers.set('authorization', `${scheme} ${token}`)
  return new Request('https://app.example/api/cron/close-periods', { method: 'POST', headers })
}

describe('authorizeCronRequest', () => {
  const original = process.env.CRON_SECRET

  beforeEach(() => {
    rpc.mockReset()
    createAdminClient.mockClear()
    delete process.env.CRON_SECRET
  })
  afterEach(() => {
    vi.restoreAllMocks()
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  describe('environment secret only', () => {
    it('accepts the matching bearer token without a database call', async () => {
      process.env.CRON_SECRET = 'plain-env-secret'
      expect(await authorizeCronRequest(req('plain-env-secret'))).toBe(true)
      expect(createAdminClient).not.toHaveBeenCalled()
    })

    it('rejects a different token that is not shaped like a database secret', async () => {
      process.env.CRON_SECRET = 'plain-env-secret'
      expect(await authorizeCronRequest(req('plain-env-secreT'))).toBe(false)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('rejects a token of the same length but different bytes', async () => {
      process.env.CRON_SECRET = HEX
      rpc.mockResolvedValue({ data: false, error: null })
      expect(await authorizeCronRequest(req(OTHER_HEX))).toBe(false)
    })
  })

  describe('database secret only', () => {
    it('accepts a 64-hex token the database vouches for', async () => {
      rpc.mockResolvedValue({ data: true, error: null })
      expect(await authorizeCronRequest(req(HEX))).toBe(true)
      expect(rpc).toHaveBeenCalledWith('cron_secret_valid', { p_secret: HEX })
    })

    it('rejects an upper-case hex token without a database call (the vault secret is lower-case)', async () => {
      rpc.mockResolvedValue({ data: true, error: null })
      expect(await authorizeCronRequest(req(HEX.toUpperCase()))).toBe(false)
      expect(createAdminClient).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })

    it('rejects when the database says no', async () => {
      rpc.mockResolvedValue({ data: false, error: null })
      expect(await authorizeCronRequest(req(HEX))).toBe(false)
    })

    it('rejects when the database answers anything but literal true', async () => {
      rpc.mockResolvedValue({ data: 'true', error: null })
      expect(await authorizeCronRequest(req(HEX))).toBe(false)
      rpc.mockResolvedValue({ data: null, error: null })
      expect(await authorizeCronRequest(req(HEX))).toBe(false)
    })
  })

  describe('both configured', () => {
    it('the environment match wins without asking the database', async () => {
      process.env.CRON_SECRET = HEX
      expect(await authorizeCronRequest(req(HEX))).toBe(true)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('the database still accepts its own secret when the environment one differs', async () => {
      process.env.CRON_SECRET = 'plain-env-secret'
      rpc.mockResolvedValue({ data: true, error: null })
      expect(await authorizeCronRequest(req(HEX))).toBe(true)
    })
  })

  describe('neither', () => {
    it('rejects a request without credentials', async () => {
      expect(await authorizeCronRequest(req())).toBe(false)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('rejects a non-bearer scheme', async () => {
      process.env.CRON_SECRET = 'plain-env-secret'
      expect(await authorizeCronRequest(req('plain-env-secret', 'Basic'))).toBe(false)
      expect(await authorizeCronRequest(req(HEX, 'Basic'))).toBe(false)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('rejects an empty bearer token even when the environment secret is empty', async () => {
      process.env.CRON_SECRET = ''
      expect(await authorizeCronRequest(req(''))).toBe(false)
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('wrong shape never costs a database call', () => {
    it.each([
      ['63 hex characters', 'a'.repeat(63)],
      ['65 hex characters', 'a'.repeat(65)],
      ['non-hex characters', 'z'.repeat(64)],
      ['hex with a space', `${'a'.repeat(63)} `],
      ['a short token', 'abc'],
    ])('%s', async (_name, token) => {
      expect(await authorizeCronRequest(req(token))).toBe(false)
      expect(createAdminClient).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('database failures answer 401, never throw', () => {
    it('an RPC error is a rejection and is logged without the token', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
      expect(await authorizeCronRequest(req(HEX))).toBe(false)
      expect(log).toHaveBeenCalledTimes(1)
      const logged = JSON.stringify(log.mock.calls)
      expect(logged).toContain('boom')
      expect(logged).not.toContain(HEX)
      log.mockRestore()
    })

    it('a rejected RPC promise is a rejection', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      rpc.mockRejectedValue(new Error('network'))
      expect(await authorizeCronRequest(req(HEX))).toBe(false)
    })

    it('a client that cannot be built (missing service key) is a rejection', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      createAdminClient.mockImplementationOnce(() => {
        throw new Error('supabaseKey is required')
      })
      expect(await authorizeCronRequest(req(HEX))).toBe(false)
    })

    it('an RPC error does not override a matching environment secret', async () => {
      process.env.CRON_SECRET = HEX
      rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
      expect(await authorizeCronRequest(req(HEX))).toBe(true)
    })
  })
})
