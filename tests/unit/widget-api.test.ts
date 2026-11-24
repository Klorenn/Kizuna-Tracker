import { describe, expect, it, vi } from 'vitest'
import type { WidgetPayload } from '@/domain/widget-payload'
import { widgetCheckin, widgetPair, widgetToday, type WidgetDeps } from '@/lib/widget-api'
import { WIDGET_TOKEN_RE, generateWidgetToken, hashWidgetToken } from '@/lib/widget-token'

const UID = '11111111-1111-4111-8111-111111111111'
const HABIT = '22222222-2222-4222-8222-222222222222'
const TOKEN = generateWidgetToken()
const AUTH = `Bearer ${TOKEN}`
const PAYLOAD: WidgetPayload = { v: 1, date: '2026-11-24', timeZone: 'UTC', done: 1, total: 2, pending: 1, habits: [{ id: HABIT, name: 'Agua', kind: 'toggle' }] }

function deps(over: Partial<WidgetDeps> = {}): WidgetDeps & { [K in keyof WidgetDeps]: ReturnType<typeof vi.fn> } {
  return {
    auth: vi.fn(async () => ({ status: 'ok', userId: UID, tokenId: 't1', timeZone: 'UTC' })),
    pair: vi.fn(async () => ({ status: 'ok', username: 'pau' })),
    loadToday: vi.fn(async () => PAYLOAD),
    checkin: vi.fn(async () => ({ ok: true, created: true })),
    ...over,
  } as never
}

describe('widgetPair', () => {
  it('200 con token kzw_ nuevo, cuyo hash viaja a la base, y el usuario', async () => {
    const d = deps()
    const r = await widgetPair(d, { body: { code: 'abcd-efgh', label: 'Pixel' }, ipKey: 'wpair:addr:1.2.3.4' })
    expect(r.status).toBe(200)
    const body = r.body as { token: string; username: string }
    expect(body.token).toMatch(WIDGET_TOKEN_RE)
    expect(body.username).toBe('pau')
    expect(d.pair).toHaveBeenCalledWith({
      code: 'abcd-efgh',
      tokenHash: hashWidgetToken(body.token),
      label: 'Pixel',
      previousTokenHash: null,
      ipKey: 'wpair:addr:1.2.3.4',
    })
  })
  it('previousToken valido viaja como hash', async () => {
    const d = deps()
    const prev = generateWidgetToken()
    await widgetPair(d, { body: { code: 'ABCDEFGH', previousToken: prev }, ipKey: null })
    expect(d.pair.mock.calls[0][0]).toMatchObject({ previousTokenHash: hashWidgetToken(prev), label: null, ipKey: null })
  })
  it('invalid -> 400 invalid_code', async () => {
    const r = await widgetPair(deps({ pair: vi.fn(async () => ({ status: 'invalid' })) } as never), { body: { code: 'ZZZZ-ZZZZ' }, ipKey: null })
    expect(r).toMatchObject({ status: 400, body: { error: 'invalid_code' } })
  })
  it('limit_reached -> 409', async () => {
    const r = await widgetPair(deps({ pair: vi.fn(async () => ({ status: 'limit_reached' })) } as never), { body: { code: 'ABCD-EFGH' }, ipKey: null })
    expect(r).toMatchObject({ status: 409, body: { error: 'limit_reached' } })
  })
  it('limited -> 429 con Retry-After', async () => {
    const r = await widgetPair(deps({ pair: vi.fn(async () => ({ status: 'limited' })) } as never), { body: { code: 'ABCD-EFGH' }, ipKey: 'k' })
    expect(r).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    expect(Number(r.retryAfter)).toBeGreaterThan(0)
  })
  it.each([
    ['null', null],
    ['array', []],
    ['sin code', {}],
    ['code numerico', { code: 1 }],
    ['code vacio', { code: '' }],
    ['code largo', { code: 'A'.repeat(33) }],
    ['label no string', { code: 'ABCD-EFGH', label: 5 }],
    ['previousToken malformado', { code: 'ABCD-EFGH', previousToken: 'nope' }],
  ])('400 invalid: %s (sin llamar a la base)', async (_n, body) => {
    const d = deps()
    const r = await widgetPair(d, { body, ipKey: null })
    expect(r).toMatchObject({ status: 400, body: { error: 'invalid' } })
    expect(d.pair).not.toHaveBeenCalled()
  })
  it('error de la base -> 502', async () => {
    const r = await widgetPair(deps({ pair: vi.fn(async () => { throw new Error('x') }) } as never), { body: { code: 'ABCD-EFGH' }, ipKey: null })
    expect(r).toMatchObject({ status: 502, body: { error: 'failed' } })
  })
})

describe('widgetToday', () => {
  it.each([
    ['sin cabecera', null],
    ['formato malo', 'Token abc'],
    ['bearer minuscula', `bearer ${TOKEN}`],
    ['token mal formado', 'Bearer kzw_short'],
  ])('401 uniforme: %s, sin tocar la base', async (_n, h) => {
    const d = deps()
    const r = await widgetToday(d, { authorization: h, ipKey: null })
    expect(r).toEqual({ status: 401, body: { error: 'unauthorized' } })
    expect(d.auth).not.toHaveBeenCalled()
  })
  it('401 con el mismo cuerpo si el token es desconocido o revocado', async () => {
    const r = await widgetToday(deps({ auth: vi.fn(async () => ({ status: 'invalid' })) } as never), { authorization: AUTH, ipKey: null })
    expect(r).toEqual({ status: 401, body: { error: 'unauthorized' } })
  })
  it('200 con el payload; auth recibe hash, ip y scope today', async () => {
    const d = deps()
    const r = await widgetToday(d, { authorization: AUTH, ipKey: 'wauth:addr:1.2.3.4' })
    expect(r).toEqual({ status: 200, body: PAYLOAD })
    expect(d.auth).toHaveBeenCalledWith({ tokenHash: hashWidgetToken(TOKEN), ipKey: 'wauth:addr:1.2.3.4', scope: 'today' })
    expect(d.loadToday).toHaveBeenCalledWith(UID, 'UTC')
  })
  it('limited -> 429 con Retry-After', async () => {
    const r = await widgetToday(deps({ auth: vi.fn(async () => ({ status: 'limited' })) } as never), { authorization: AUTH, ipKey: null })
    expect(r.status).toBe(429)
    expect(Number(r.retryAfter)).toBeGreaterThan(0)
  })
  it('lectura fallida -> 502', async () => {
    const r = await widgetToday(deps({ loadToday: vi.fn(async () => null) } as never), { authorization: AUTH, ipKey: null })
    expect(r).toMatchObject({ status: 502, body: { error: 'failed' } })
  })
  it('auth lanza -> 502', async () => {
    const r = await widgetToday(deps({ auth: vi.fn(async () => { throw new Error('x') }) } as never), { authorization: AUTH, ipKey: null })
    expect(r.status).toBe(502)
  })
})

describe('widgetCheckin', () => {
  it('200 {created, today} y revalida / y el habito solo en exito', async () => {
    const d = deps()
    const r = await widgetCheckin(d, { authorization: AUTH, ipKey: null, body: { habitId: HABIT } })
    expect(r).toEqual({ status: 200, body: { created: true, today: PAYLOAD }, revalidate: ['/', `/habitos/${HABIT}`] })
    expect(d.auth.mock.calls[0][0].scope).toBe('checkin')
  })
  it('el usuario sale solo del resultado de auth, nunca del cuerpo', async () => {
    const d = deps()
    await widgetCheckin(d, { authorization: AUTH, ipKey: null, body: { habitId: HABIT, userId: 'attacker', user_id: 'attacker' } })
    expect(d.checkin).toHaveBeenCalledWith(UID, HABIT)
    expect(d.loadToday).toHaveBeenCalledWith(UID, 'UTC')
  })
  it('repetir es exito idempotente (created false)', async () => {
    const r = await widgetCheckin(deps({ checkin: vi.fn(async () => ({ ok: true, created: false })) } as never), { authorization: AUTH, ipKey: null, body: { habitId: HABIT } })
    expect(r).toMatchObject({ status: 200, body: { created: false }, revalidate: ['/', `/habitos/${HABIT}`] })
  })
  it('today null si la relectura falla, el check-in sigue siendo 200', async () => {
    const r = await widgetCheckin(deps({ loadToday: vi.fn(async () => null) } as never), { authorization: AUTH, ipKey: null, body: { habitId: HABIT } })
    expect(r).toMatchObject({ status: 200, body: { created: true, today: null } })
  })
  it.each(['habit_not_found', 'quantity_habit', 'habit_has_items', 'photo_required', 'widget_unsupported'])('%s -> 422 unsupported, sin revalidar', async (message) => {
    const r = await widgetCheckin(deps({ checkin: vi.fn(async () => ({ ok: false, message })) } as never), { authorization: AUTH, ipKey: null, body: { habitId: HABIT } })
    expect(r).toEqual({ status: 422, body: { error: 'unsupported' } })
  })
  it('not_authenticated -> 401', async () => {
    const r = await widgetCheckin(deps({ checkin: vi.fn(async () => ({ ok: false, message: 'not_authenticated' })) } as never), { authorization: AUTH, ipKey: null, body: { habitId: HABIT } })
    expect(r).toEqual({ status: 401, body: { error: 'unauthorized' } })
  })
  it('otro error -> 502 sin revalidar', async () => {
    const r = await widgetCheckin(deps({ checkin: vi.fn(async () => ({ ok: false, message: 'boom' })) } as never), { authorization: AUTH, ipKey: null, body: { habitId: HABIT } })
    expect(r).toEqual({ status: 502, body: { error: 'failed' } })
  })
  it('401 sin cabecera valida; no llega a check-in', async () => {
    const d = deps()
    const r = await widgetCheckin(d, { authorization: null, ipKey: null, body: { habitId: HABIT } })
    expect(r.status).toBe(401)
    expect(d.checkin).not.toHaveBeenCalled()
  })
  it('token invalido -> 401, limited -> 429', async () => {
    expect((await widgetCheckin(deps({ auth: vi.fn(async () => ({ status: 'invalid' })) } as never), { authorization: AUTH, ipKey: null, body: { habitId: HABIT } })).status).toBe(401)
    const r = await widgetCheckin(deps({ auth: vi.fn(async () => ({ status: 'limited' })) } as never), { authorization: AUTH, ipKey: null, body: { habitId: HABIT } })
    expect(r.status).toBe(429)
    expect(Number(r.retryAfter)).toBeGreaterThan(0)
  })
  it.each([
    ['null', null],
    ['sin habitId', {}],
    ['no uuid', { habitId: 'x' }],
    ['numero', { habitId: 1 }],
  ])('400: cuerpo %s', async (_n, body) => {
    const d = deps()
    const r = await widgetCheckin(d, { authorization: AUTH, ipKey: null, body })
    expect(r).toEqual({ status: 400, body: { error: 'invalid' } })
    expect(d.checkin).not.toHaveBeenCalled()
  })
  it('checkin lanza -> 502', async () => {
    const r = await widgetCheckin(deps({ checkin: vi.fn(async () => { throw new Error('x') }) } as never), { authorization: AUTH, ipKey: null, body: { habitId: HABIT } })
    expect(r.status).toBe(502)
  })
})
