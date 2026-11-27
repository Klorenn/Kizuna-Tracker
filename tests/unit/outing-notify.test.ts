import { describe, expect, test } from 'vitest'
import { notificationView } from '@/lib/notification-copy'

const outingId = '6b0e0c6a-3e3e-4e3e-8e3e-3e3e3e3e3e3e'

describe('avisos de una salida', () => {
  test('una invitación nombra a la persona, el lugar y el mapa', () => {
    expect(
      notificationView('outing_invited', {
        from_name: 'Sofía',
        place_name: 'Termas Geométricas',
        outing_id: outingId,
      }),
    ).toEqual({
      title: 'Sofía te invita a una salida',
      body: 'Termas Geométricas',
      url: `/mapa?salida=${outingId}`,
    })
  })

  test('un id que no es uuid cae en /mapa', () => {
    expect(
      notificationView('outing_invited', {
        from_name: 'Sofía',
        place_name: 'Termas Geométricas',
        outing_id: '../otro',
      }).url,
    ).toBe('/mapa')
  })

  test('sin nombre, el título no inventa una persona', () => {
    expect(notificationView('outing_invited', { outing_id: outingId }).title).toBe('Te invitan a una salida')
    expect(notificationView('outing_invited', { outing_id: outingId }).body).toBe('Revisa el lugar y responde.')
    expect(notificationView('outing_accepted', { place_name: 'Termas Geométricas', outing_id: outingId })).toEqual({
      title: 'Aceptaron tu salida',
      body: 'Termas Geométricas',
      url: `/mapa?salida=${outingId}`,
    })
    expect(notificationView('outing_declined', { from_name: 'Sofía', place_name: 'Termas Geométricas' })).toEqual({
      title: 'Sofía no pudo esta salida',
      body: 'Termas Geométricas',
      url: '/mapa',
    })
    expect(notificationView('outing_cancelled', { place_name: 'Termas Geométricas' })).toEqual({
      title: 'Quitaron una salida',
      body: 'Termas Geométricas',
      url: '/mapa',
    })
  })
})
