import { describe, expect, it, vi } from 'vitest'
import { loadWidgetDevices } from '@/lib/widget-devices'

function fake(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = []
  const b: Record<string, unknown> = {}
  for (const f of ['select', 'eq', 'is', 'order']) {
    b[f] = (...a: unknown[]) => {
      calls.push([f, a])
      return b
    }
  }
  b.then = (res: (v: unknown) => unknown) => res(result)
  const from = vi.fn(() => b)
  return { client: { from }, calls, from }
}

describe('loadWidgetDevices', () => {
  it('lista los dispositivos vivos sin pedir token_hash', async () => {
    const { client, calls, from } = fake({ data: [{ id: 'a', label: 'Pixel', created_at: '2026-11-20T00:00:00Z', last_used_at: null }], error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await loadWidgetDevices(client as any, 'u1')
    expect(r).toEqual([{ id: 'a', label: 'Pixel', createdAt: '2026-11-20T00:00:00Z', lastUsedAt: null }])
    expect(from).toHaveBeenCalledWith('widget_tokens')
    const select = calls.find(([f]) => f === 'select')![1][0] as string
    expect(select).not.toContain('token_hash')
    expect(select).not.toBe('*')
    expect(calls).toContainEqual(['eq', ['user_id', 'u1']])
    expect(calls).toContainEqual(['is', ['revoked_at', null]])
  })
  it('null si la lectura falla', async () => {
    const { client } = fake({ data: null, error: { message: 'x' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await loadWidgetDevices(client as any, 'u1')).toBeNull()
  })
})
