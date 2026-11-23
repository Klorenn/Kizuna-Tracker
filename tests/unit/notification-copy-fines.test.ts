import { describe, expect, it } from 'vitest'
import { notificationView } from '@/lib/notification-copy'

const G = '11111111-1111-4111-8111-111111111111'
const URL = `/grupos/${G}?seccion=fondo`
const WALL = `/grupos/${G}?seccion=muro`

describe('notificationView: the fine types', () => {
  it('group_fine_proposed', () => {
    expect(notificationView('group_fine_proposed', { group_id: G, group_name: 'Gym', amount: 2500, purpose: 'Asado' })).toEqual({
      title: 'Gym: proponen una multa de $2.500 por semana',
      body: 'Fondo: Asado',
      url: URL,
    })
  })
  it('group_fine_active', () => {
    expect(notificationView('group_fine_active', { group_id: G, group_name: 'Gym', amount: 2500 })).toEqual({
      title: 'Gym: la multa de $2.500 ya está activa',
      body: 'Participas si la aceptaste. Revisa el grupo.',
      url: URL,
    })
  })
  it('group_fine_expired', () => {
    expect(notificationView('group_fine_expired', { group_id: G, group_name: 'Gym', amount: 2500 })).toEqual({
      title: 'Gym: la propuesta de multa no alcanzó los votos',
      body: 'Cualquier administrador puede proponer otra.',
      url: URL,
    })
  })
  it('group_fund_debt', () => {
    expect(notificationView('group_fund_debt', { group_id: G, group_name: 'Gym', week_start: '2026-11-16', amount: 2500 })).toEqual({
      title: 'Le debes $2.500 al fondo de Gym',
      body: 'Semana del 16 de noviembre. La app solo registra. El pago se hace fuera de la app.',
      url: URL,
    })
  })
  it('group_photo_rejected', () => {
    expect(notificationView('group_photo_rejected', { group_id: G, group_name: 'Gym', local_date: '2026-11-22', reason: 'Foto borrosa' })).toEqual({
      title: 'Gym: rechazaron tu foto del 22 de noviembre',
      body: 'Motivo: Foto borrosa',
      url: WALL,
    })
  })

  describe('defensive about payloads', () => {
    it('proposed without amount, purpose or name', () => {
      expect(notificationView('group_fine_proposed', { group_id: G })).toEqual({
        title: 'Proponen una multa en tu grupo',
        body: 'Revisa la propuesta y vota.',
        url: URL,
      })
    })
    it('active and expired without amount', () => {
      expect(notificationView('group_fine_active', { group_id: G, group_name: 'Gym' }).title).toBe('Gym: la multa ya está activa')
      expect(notificationView('group_fine_expired', { group_id: G }).title).toBe('La propuesta de multa de tu grupo no alcanzó los votos')
    })
    it('a debt without amount or group', () => {
      expect(notificationView('group_fund_debt', { group_id: G })).toEqual({
        title: 'Tienes una deuda con el fondo de tu grupo',
        body: 'La app solo registra. El pago se hace fuera de la app.',
        url: URL,
      })
    })
    it('a rejection without date or reason', () => {
      expect(notificationView('group_photo_rejected', { group_id: G, group_name: 'Gym' })).toEqual({
        title: 'Gym: rechazaron tu foto',
        body: 'Revisa el grupo para ver el detalle.',
        url: WALL,
      })
    })
    it('a non-date local_date is ignored; a blank reason is ignored', () => {
      const v = notificationView('group_photo_rejected', { group_id: G, group_name: 'Gym', local_date: 'mañana', reason: '   ' })
      expect(v.title).toBe('Gym: rechazaron tu foto')
      expect(v.body).toBe('Revisa el grupo para ver el detalle.')
    })
    it('amounts of the wrong type are ignored, never printed', () => {
      for (const amount of ['2500', null, NaN, -4, 12.5, {}]) {
        expect(notificationView('group_fine_active', { group_id: G, group_name: 'Gym', amount }).title).toBe('Gym: la multa ya está activa')
      }
    })
    it('a bad or missing group id falls back to the list, never into a path', () => {
      for (const group_id of [undefined, '../../etc', 5, '']) {
        expect(notificationView('group_fine_active', { group_id, group_name: 'Gym', amount: 100 }).url).toBe('/grupos')
      }
    })
    it('an empty payload never throws', () => {
      for (const t of ['group_fine_proposed', 'group_fine_active', 'group_fine_expired', 'group_fund_debt', 'group_photo_rejected']) {
        const v = notificationView(t, {})
        expect(v.title.length).toBeGreaterThan(0)
        expect(v.url).toBe('/grupos')
      }
    })
  })

  it('never uses the forbidden words', () => {
    const all = ['group_fine_proposed', 'group_fine_active', 'group_fine_expired', 'group_fund_debt', 'group_photo_rejected']
      .flatMap((t) => [notificationView(t, {}), notificationView(t, { group_id: G, group_name: 'Gym', amount: 5, purpose: 'x', reason: 'y', local_date: '2026-11-22', week_start: '2026-11-16' })])
      .map((v) => `${v.title} ${v.body}`)
      .join(' ')
    expect(all).not.toMatch(/apuesta|\bbet\b|pozo/i)
  })
})
