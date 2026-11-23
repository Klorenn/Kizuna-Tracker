import { describe, expect, it, vi } from 'vitest'
import type { GroupBoardRow, GroupWallItem } from '@/lib/groups-contract'
import {
  appendWallPage,
  complianceOf,
  copyLink,
  createRunner,
  iconKeyOf,
  isComplied,
  sortBoard,
  validateCommitment,
  validateEdit,
  weekRange,
} from '@/components/groups/detail/group-logic'

const person = (n: string) => ({ userId: `u-${n}`, username: n, displayName: n.toUpperCase(), avatarPath: null, avatarPreset: null })
const row = (n: string, done: number, target = 3, counts = true, role: 'admin' | 'member' = 'member'): GroupBoardRow => ({
  ...person(n),
  role,
  joinedOn: '2026-11-02',
  counts,
  done,
  target,
})
const item = (id: string, date = '2026-11-20'): GroupWallItem => ({
  ...person('ana'),
  checkinId: id,
  localDate: date,
  photoPath: null,
  createdAt: `${date}T10:00:00Z`,
})

describe('board logic', () => {
  it('orders by progress, then name; rows that do not count yet go last', () => {
    const rows = [row('zoe', 1), row('ana', 3), row('beto', 3), row('lu', 0, 3, false), row('cami', 2)]
    expect(sortBoard(rows).map((r) => r.username)).toEqual(['ana', 'beto', 'cami', 'zoe', 'lu'])
  })
  it('does not mutate its input', () => {
    const rows = [row('b', 1), row('a', 2)]
    sortBoard(rows)
    expect(rows.map((r) => r.username)).toEqual(['b', 'a'])
  })
  it('compliance: counted rows only, done at or over the target', () => {
    const rows = [row('a', 3), row('b', 4), row('c', 2), row('d', 0, 3, false)]
    expect(isComplied(rows[1])).toBe(true)
    expect(isComplied(rows[3])).toBe(false)
    expect(complianceOf(rows)).toEqual({ complied: 2, counted: 3 })
  })
})

describe('wall pages', () => {
  it('appends a page and drops check-ins already shown, by checkinId', () => {
    const first = { pages: [[item('1'), item('2')]], next: { before: 'x', beforeId: '2' }, error: null }
    const out = appendWallPage(first, { items: [item('2'), item('3')], next: null })
    expect(out.pages.map((p) => p.map((i) => i.checkinId))).toEqual([['1', '2'], ['3']])
    expect(out.next).toBeNull()
    expect(out.error).toBeNull()
  })
  it('a page that only repeats rows adds no empty page', () => {
    const first = { pages: [[item('1')]], next: null, error: null }
    expect(appendWallPage(first, { items: [item('1')], next: null }).pages).toHaveLength(1)
  })
})

describe('copyLink', () => {
  it('copies and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await copyLink('https://x/y', { writeText })).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://x/y')
  })
  it('no clipboard: unavailable', async () => {
    expect(await copyLink('https://x/y', undefined)).toBe('unavailable')
  })
  it('clipboard that rejects or throws: unavailable', async () => {
    expect(await copyLink('u', { writeText: () => Promise.reject(new Error('denied')) })).toBe('unavailable')
    expect(
      await copyLink('u', {
        writeText: () => {
          throw new Error('sync')
        },
      }),
    ).toBe('unavailable')
  })
})

describe('createRunner (no double submit)', () => {
  it('ignores a second call while the first is in flight and accepts one after', async () => {
    let release: (v: { ok: true; data: undefined }) => void = () => {}
    const fn = vi.fn(() => new Promise<{ ok: true; data: undefined }>((r) => (release = r)))
    const runner = createRunner()
    const a = runner.run(fn)
    const b = await runner.run(fn)
    expect(b).toBeNull()
    expect(fn).toHaveBeenCalledTimes(1)
    release({ ok: true, data: undefined })
    expect(await a).toEqual({ ok: true, data: undefined })
    expect(await runner.run(async () => ({ ok: true as const, data: undefined }))).toEqual({ ok: true, data: undefined })
  })
  it('a thrown action becomes an error result and unlocks', async () => {
    const runner = createRunner()
    const r = await runner.run(async () => {
      throw new Error('network')
    })
    expect(r).toEqual({ ok: false, error: 'No pudimos conectar. Inténtalo de nuevo en unos minutos.' })
    expect(runner.busy()).toBe(false)
  })
})

describe('validation and labels', () => {
  const ok = { name: 'Gym del sur', icon: 'barbell', color: 'salvia', description: '' }
  it('edit: name 3..40, description up to 140', () => {
    expect(validateEdit(ok)).toBeNull()
    expect(validateEdit({ ...ok, name: ' ab ' })).toBe('El nombre debe tener entre 3 y 40 letras.')
    expect(validateEdit({ ...ok, name: 'x'.repeat(41) })).toBe('El nombre debe tener entre 3 y 40 letras.')
    expect(validateEdit({ ...ok, description: 'x'.repeat(141) })).toBe('La descripción puede tener hasta 140 caracteres.')
  })
  it('commitment: name required (up to 40), 1..7 per week', () => {
    const c = { name: 'Gimnasio', icon: 'barbell', targetPerWeek: 3, requiresPhoto: false }
    expect(validateCommitment(c)).toBeNull()
    expect(validateCommitment({ ...c, name: '  ' })).toBe('Escribe el compromiso del grupo.')
    expect(validateCommitment({ ...c, name: 'x'.repeat(41) })).toBe('El compromiso puede tener hasta 40 caracteres.')
    expect(validateCommitment({ ...c, targetPerWeek: 0 })).toBe('Elige entre 1 y 7 veces por semana.')
    expect(validateCommitment({ ...c, targetPerWeek: 8 })).toBe('Elige entre 1 y 7 veces por semana.')
  })
  it('week range and icon fallback', () => {
    expect(weekRange('2026-11-16')).toBe('16 nov al 22 nov')
    expect(weekRange('2026-12-28')).toBe('28 dic al 3 ene')
    expect(iconKeyOf('barbell')).toBe('barbell')
    expect(iconKeyOf('not-an-icon')).toBe('users')
  })
})
