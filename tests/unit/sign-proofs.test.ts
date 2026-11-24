import { describe, expect, it, vi } from 'vitest'
import { signProofUrls, PROOF_SIGNED_SECONDS } from '@/lib/sign-proofs'

const client = (rows: Array<{ path: string; signedUrl: string; error: string | null }> | null, fail = false) => {
  const createSignedUrls = vi.fn(async () => (fail ? { data: null, error: { message: 'x' } } : { data: rows, error: null }))
  const from = vi.fn(() => ({ createSignedUrls }))
  return { c: { storage: { from } } as never, from, createSignedUrls }
}

describe('signProofUrls (server)', () => {
  it('signs all distinct paths in ONE call on the proofs bucket with the shared expiry', async () => {
    const { c, from, createSignedUrls } = client([
      { path: 'a/1.jpg', signedUrl: 'https://s/1', error: null },
      { path: 'a/2.jpg', signedUrl: 'https://s/2', error: null },
    ])
    const r = await signProofUrls(c, ['a/1.jpg', 'a/2.jpg', 'a/1.jpg'])
    expect(from).toHaveBeenCalledWith('proofs')
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(['a/1.jpg', 'a/2.jpg'], PROOF_SIGNED_SECONDS)
    expect(PROOF_SIGNED_SECONDS).toBe(300)
    expect(r).toEqual({ 'a/1.jpg': 'https://s/1', 'a/2.jpg': 'https://s/2' })
  })

  it('no paths: no round trip', async () => {
    const { c, createSignedUrls } = client([])
    expect(await signProofUrls(c, [])).toEqual({})
    expect(createSignedUrls).not.toHaveBeenCalled()
  })

  it('a path that could not be signed is left out (the browser retries it); a failed call yields {}', async () => {
    const { c } = client([
      { path: 'a/1.jpg', signedUrl: 'https://s/1', error: null },
      { path: 'a/2.jpg', signedUrl: '', error: 'Object not found' },
    ])
    expect(await signProofUrls(c, ['a/1.jpg', 'a/2.jpg'])).toEqual({ 'a/1.jpg': 'https://s/1' })
    expect(await signProofUrls(client(null, true).c, ['a/1.jpg'])).toEqual({})
  })

  it('a throwing client never breaks the page', async () => {
    const c = { storage: { from: () => ({ createSignedUrls: () => Promise.reject(new Error('net')) }) } } as never
    expect(await signProofUrls(c, ['a/1.jpg'])).toEqual({})
  })
})
