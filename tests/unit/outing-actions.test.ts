import { describe, expect, test } from 'vitest'
import type { PlacePick } from '@/domain/outings'
import {
  cancelOutingWith,
  createOutingWith,
  setTripLinkWith,
  inviteCompanionWith,
  markWentWith,
  outingErrorCopy,
  repeatOutingWith,
  respondInviteWith,
  updateOutingWith,
  updateVisitWith,
  type OutingActionDeps,
  type Rpc,
} from '@/lib/outing-actions'

const place: PlacePick = {
  name: 'Termas Geométricas',
  detail: 'Coñaripe, Los Ríos',
  placeKey: 'nominatim:way:281946924',
  lat: -39.5735,
  lng: -71.7892,
}

const month = '2026-11-01'
const id = '6b0e0c6a-3e3e-4e3e-8e3e-3e3e3e3e3e3e'

describe('createOutingWith', () => {
  test('un borrador inválido no llama al RPC', async () => {
    let calls = 0
    const rpc: Rpc = async () => {
      calls += 1
      return { data: id, error: null }
    }
    const result = await createOutingWith(rpc, {
      place: null,
      startsOn: '2026-11-12',
      endsOn: '2026-11-14',
      note: '',
      month,
    })
    expect(result.ok).toBe(false)
    expect(calls).toBe(0)
  })

  test('un uuid del RPC es la salida creada', async () => {
    const rpc: Rpc = async (fn, args) => {
      expect(fn).toBe('create_outing')
      expect(args).toMatchObject({
        p_place_name: place.name,
        p_place_detail: place.detail,
        p_place_key: place.placeKey,
        p_lat: place.lat,
        p_lng: place.lng,
        p_starts_on: '2026-11-12',
        p_ends_on: '2026-11-14',
      })
      return { data: id, error: null }
    }
    await expect(
      createOutingWith(rpc, { place, startsOn: '2026-11-12', endsOn: '2026-11-14', note: '', month }),
    ).resolves.toEqual({ ok: true, id })
  })

  test('un nombre largo no llama al RPC y uno recortado sí', async () => {
    let sent: unknown = null
    const rpc: Rpc = async (_fn, args) => {
      sent = args
      return { data: id, error: null }
    }
    const long = await createOutingWith(rpc, {
      place,
      startsOn: '2026-11-12',
      endsOn: '2026-11-14',
      note: '',
      month,
      guestName: 'a'.repeat(41),
    })
    expect(long.ok).toBe(false)
    expect(sent).toBeNull()
    await createOutingWith(rpc, {
      place,
      startsOn: '2027-01-10',
      endsOn: '2027-01-12',
      note: '',
      month: '2027-01-01',
      guestName: '  Mamá  ',
    })
    expect(sent).toMatchObject({ p_guest_name: 'Mamá', p_starts_on: '2027-01-10' })
  })
})

describe('outingErrorCopy', () => {
  test('invalid_dates con o sin el prefijo de Postgres', () => {
    expect(outingErrorCopy('invalid_dates')).toBe('Esas fechas no caben en este mes.')
    expect(outingErrorCopy('ERROR: invalid_dates')).toBe('Esas fechas no caben en este mes.')
  })

  test('un mensaje raro es el genérico', () => {
    expect(outingErrorCopy('database is on fire')).toBe('No pudimos guardar la salida. Inténtalo de nuevo.')
  })
})

describe('markWentWith', () => {
  test('month_closed y too_early usan el copy de la spec', async () => {
    const monthClosed: Rpc = async (fn, args) => {
      expect(fn).toBe('mark_outing_went')
      expect(args).toEqual({ p_id: id })
      return { data: null, error: { message: 'month_closed' } }
    }
    const tooEarly: Rpc = async () => ({ data: null, error: { message: 'too_early' } })
    expect(await markWentWith(monthClosed, id)).toEqual({
      ok: false,
      error: 'Ese mes ya cerró. Quedó vacío.',
    })
    expect(await markWentWith(tooEarly, id)).toEqual({
      ok: false,
      error: 'Puedes marcar Fui desde el día en que empieza.',
    })
  })
})

const friendId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ownerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function quietDeps(rpc: Rpc, notify: OutingActionDeps['notify'] = async () => {}): OutingActionDeps {
  return { rpc, notify }
}

describe('inviteCompanionWith', () => {
  test('avisa una vez al amigo y un not_friend no avisa', async () => {
    const notices: unknown[][] = []
    const notify: OutingActionDeps['notify'] = async (userId, type, payload) => {
      notices.push([userId, type, payload])
    }
    const rpc: Rpc = async (fn, args) => {
      expect(fn).toBe('invite_outing_companion')
      expect(args).toEqual({ p_outing_id: id, p_friend_id: friendId })
      return { data: 'invite-id', error: null }
    }
    expect(await inviteCompanionWith(quietDeps(rpc, notify), { outingId: id, friendId })).toEqual({ ok: true })
    expect(notices).toHaveLength(1)
    expect(notices[0]?.[0]).toBe(friendId)
    expect(notices[0]?.[1]).toBe('outing_invited')
    expect(notices[0]?.[2]).toMatchObject({ outing_id: id })

    const denied: Rpc = async () => ({ data: null, error: { message: 'not_friend' } })
    expect(await inviteCompanionWith(quietDeps(denied, notify), { outingId: id, friendId })).toEqual({
      ok: false,
      error: 'Solo puedes invitar a un amigo.',
    })
    expect(notices).toHaveLength(1)
  })

  test('si el aviso lanza, la invitación igual quedó', async () => {
    const rpc: Rpc = async () => ({ data: 'invite-id', error: null })
    const notify: OutingActionDeps['notify'] = async () => {
      throw new Error('push down')
    }
    expect(await inviteCompanionWith(quietDeps(rpc, notify), { outingId: id, friendId })).toEqual({ ok: true })
  })
})

describe('respondInviteWith', () => {
  test('rechazar avisa al dueño con el lugar del json y no lee otra tabla', async () => {
    let reads = 0
    const notices: unknown[][] = []
    const rpc: Rpc = async (fn, args) => {
      reads += 1
      expect(fn).toBe('respond_outing_invite')
      expect(args).toEqual({ p_invite_id: 'inv-1', p_accept: false })
      return { data: { owner_id: ownerId, place_name: 'Termas Geométricas' }, error: null }
    }
    const notify: OutingActionDeps['notify'] = async (userId, type, payload) => {
      notices.push([userId, type, payload])
    }
    expect(await respondInviteWith(quietDeps(rpc, notify), { inviteId: 'inv-1', accept: false })).toEqual({ ok: true })
    expect(reads).toBe(1)
    expect(notices).toEqual([[ownerId, 'outing_declined', { place_name: 'Termas Geométricas' }]])
  })
})

describe('cancel y update', () => {
  test('cancel y update mandan p_id y traducen outing_closed', async () => {
    const notices: unknown[] = []
    const rpc: Rpc = async (fn, args) => {
      expect(args).toEqual(
        fn === 'cancel_outing'
          ? { p_id: id }
          : expect.objectContaining({ p_id: id, p_place_name: place.name }),
      )
      return { data: null, error: { message: 'outing_closed' } }
    }
    expect(
      await cancelOutingWith(
        quietDeps(rpc, async () => {
          notices.push('notice')
        }),
        id,
      ),
    ).toEqual({
      ok: false,
      error: 'Esta salida ya quedó marcada.',
    })
    expect(notices).toEqual([])
    expect(
      await updateOutingWith(rpc, {
        id,
        place,
        startsOn: '2026-11-12',
        endsOn: '2026-11-14',
        note: '',
        month,
      }),
    ).toEqual({ ok: false, error: 'Esta salida ya quedó marcada.' })
  })

  test('cancel devuelve el invitado y avisa solo si había uno', async () => {
    const notices: unknown[][] = []
    const notify: OutingActionDeps['notify'] = async (userId, type, payload) => {
      notices.push([userId, type, payload])
    }
    const withGuest: Rpc = async () => ({ data: { invitee_id: friendId, place_name: 'Termas Geométricas' }, error: null })
    expect(await cancelOutingWith(quietDeps(withGuest, notify), id)).toEqual({ ok: true, inviteeId: friendId })
    expect(notices).toEqual([
      [friendId, 'outing_cancelled', { outing_id: id, place_name: 'Termas Geométricas' }],
    ])

    const alone: Rpc = async () => ({ data: { invitee_id: null }, error: null })
    expect(await cancelOutingWith(quietDeps(alone, notify), id)).toEqual({ ok: true, inviteeId: null })
    expect(notices).toHaveLength(1)
  })
})

describe('updateVisitWith', () => {
  test('un día futuro no llama al RPC y un día vacío manda fecha nula', async () => {
    let args: unknown
    const rpc: Rpc = async (fn, input) => {
      expect(fn).toBe('update_outing')
      args = input
      return { data: null, error: null }
    }
    expect(await updateVisitWith(rpc, { id, place, on: '2027-01-10', today: '2026-11-28' })).toMatchObject({ ok: false })
    expect(args).toBeUndefined()
    expect(await updateVisitWith(rpc, { id, place, on: '  ', today: '2026-11-28' })).toEqual({ ok: true })
    expect(args).toMatchObject({ p_id: id, p_starts_on: null, p_ends_on: null, p_place_name: place.name })
  })
})

describe('repeatOutingWith', () => {
  test('not_found usa el texto genérico y no marca Fui', async () => {
    const calls: string[] = []
    const rpc: Rpc = async (fn) => {
      calls.push(fn)
      return { data: null, error: { message: 'not_found' } }
    }
    expect(await repeatOutingWith(rpc, id)).toEqual({
      ok: false,
      error: 'No pudimos guardar la salida. Inténtalo de nuevo.',
    })
    expect(calls).toEqual(['repeat_outing'])
  })
})

describe('setTripLinkWith', () => {
  test('guarda el link https y manda null cuando queda vacío', async () => {
    const calls: unknown[] = []
    const rpc: Rpc = async (fn, args) => {
      calls.push([fn, args])
      return { data: null, error: null }
    }
    expect(await setTripLinkWith(rpc, { tripId: id, link: 'https://drive.google.com/drive/folders/abc' })).toEqual({
      ok: true,
    })
    expect(await setTripLinkWith(rpc, { tripId: id, link: '  ' })).toEqual({ ok: true })
    expect(calls).toEqual([
      ['set_trip_link', { p_id: id, p_link: 'https://drive.google.com/drive/folders/abc' }],
      ['set_trip_link', { p_id: id, p_link: null }],
    ])
  })

  test('un http no llama al RPC', async () => {
    let calls = 0
    const rpc: Rpc = async () => {
      calls += 1
      return { data: null, error: null }
    }
    const result = await setTripLinkWith(rpc, { tripId: id, link: 'http://drive.google.com/x' })
    expect(result.ok).toBe(false)
    expect(calls).toBe(0)
  })
})
