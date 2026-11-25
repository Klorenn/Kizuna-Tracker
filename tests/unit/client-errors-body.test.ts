import { describe, expect, it } from 'vitest'
import { readBodyCapped } from '@/lib/client-errors/body'

const stream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({ start(c) { for (const x of chunks) c.enqueue(new TextEncoder().encode(x)); c.close() } })

describe('readBodyCapped', () => {
  it('reads a small body', async () => {
    expect(await readBodyCapped(stream(['{"a":', '1}']), 8192)).toBe('{"a":1}')
  })
  it('returns null as soon as the cap is exceeded, without reading the rest', async () => {
    let pulled = 0
    const s = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(4096)); if (pulled > 50) c.close() } })
    expect(await readBodyCapped(s, 8192)).toBeNull()
    expect(pulled).toBeLessThan(10)
  })
  it('null body is empty text', async () => {
    expect(await readBodyCapped(null, 8192)).toBe('')
  })
})
