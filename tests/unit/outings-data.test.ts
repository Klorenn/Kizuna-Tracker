import { describe, expect, test } from 'vitest'
import { loadMyMap, loadMyMonth, loadMyOutingInvite, parseMapPayload, parseMonthPayload, parseOutingInvite, type Rpc } from '@/lib/outings-data'

const outing = {
  id: '6b0e0c6a-3e3e-4e3e-8e3e-3e3e3e3e3e3e',
  place_name: 'Termas Geométricas',
  place_detail: 'Coñaripe',
  place_key: 'nominatim:way:281946924',
  lat: -39.5735,
  lng: -71.7892,
  starts_on: '2026-11-12',
  ends_on: '2026-11-14',
  note: null,
  status: 'planned',
  went_on: null,
}

describe('parseMonthPayload', () => {
  test('un mes válido con cero y una salida planeada', () => {
    expect(
      parseMonthPayload({ month_start: '2026-11-01', completed: 0, outings: [outing] }),
    ).toEqual({
      monthStart: '2026-11-01',
      completed: 0,
      outings: [
        {
          id: outing.id,
          placeName: 'Termas Geométricas',
          placeDetail: 'Coñaripe',
          placeKey: 'nominatim:way:281946924',
          lat: -39.5735,
          lng: -71.7892,
          startsOn: '2026-11-12',
          endsOn: '2026-11-14',
          note: null,
          status: 'planned',
          wentOn: null,
          guestName: null,
          companionName: null,
          inviteStatus: null,
          isOwner: true,
        },
      ],
    })
  })

  test('sin la lista de salidas no inventa un mes vacío', () => {
    expect(parseMonthPayload({ month_start: '2026-11-01' })).toBeNull()
  })

  test('completed en texto no es un cero', () => {
    expect(parseMonthPayload({ month_start: '2026-11-01', completed: '0', outings: [] })).toBeNull()
  })

  test('sin las claves del acompañante la fila sigue y queda en null', () => {
    expect(parseMonthPayload({ month_start: '2026-11-01', completed: 0, outings: [outing] })?.outings[0]).toMatchObject({
      companionName: null,
      inviteStatus: null,
      isOwner: true,
    })
  })

  test('invite_status declined descarta esa fila y no el mes', () => {
    expect(
      parseMonthPayload({
        month_start: '2026-11-01',
        completed: 0,
        outings: [
          { ...outing, invite_status: 'declined' },
          { ...outing, id: 'otra', invite_status: 'accepted', companion_name: 'Sofía', is_owner: false },
        ],
      }),
    ).toMatchObject({
      outings: [{ id: 'otra', companionName: 'Sofía', inviteStatus: 'accepted', isOwner: false }],
    })
  })
})

describe('loadMyMonth', () => {
  test('un error de lectura no es completed 0', async () => {
    const rpc: Rpc = async () => ({
      data: { month_start: '2026-11-01', completed: 0, outings: [] },
      error: { message: 'boom' },
    })
    const result = await loadMyMonth(rpc)
    expect(result).toEqual({ ok: false })
  })
})

describe('parseMapPayload', () => {
  test('la fase 1 exige plans vacío', () => {
    expect(parseMapPayload({ pins: [], plans: [] })).toEqual({ pins: [], plans: [], upcoming: [] })
    expect(parseMapPayload({ pins: [] })).toBeNull()
  })

  test('un plan de un mes anterior no vacía el mapa', () => {
    expect(
      parseMapPayload({
        pins: [],
        plans: [{ id: 'p', place_name: 'Pucón', lat: -39.27, lng: -71.98 }],
      }),
    ).toEqual({
      pins: [],
      plans: [{ id: 'p', placeName: 'Pucón', lat: -39.27, lng: -71.98 }],
      upcoming: [],
    })
  })

  test('un plan de enero con un nombre queda en la checklist', () => {
    expect(
      parseMapPayload({
        pins: [],
        plans: [],
        upcoming: [
          {
            id: 'u',
            place_name: 'Puerto Natales',
            lat: -51.73,
            lng: -72.5,
            starts_on: '2027-01-10',
            ends_on: '2027-01-12',
            month_start: '2027-01-01',
            guest_name: 'Mamá',
          },
        ],
      }),
    ).toEqual({
      pins: [],
      plans: [],
      upcoming: [
        {
          id: 'u',
          placeName: 'Puerto Natales',
          lat: -51.73,
          lng: -72.5,
          startsOn: '2027-01-10',
          endsOn: '2027-01-12',
          monthStart: '2027-01-01',
          guestName: 'Mamá',
        },
      ],
    })
  })
})

describe('parseOutingInvite', () => {
  test('pending se lee y un id que no es uuid no llama al RPC', async () => {
    expect(parseOutingInvite(null)).toBeNull()
    expect(
      parseOutingInvite({
        invite_id: '6b0e0c6a-3e3e-4e3e-8e3e-3e3e3e3e3e3e',
        status: 'pending',
        place_name: 'Termas Geométricas',
        place_detail: null,
        lat: -39.57,
        lng: -71.79,
        starts_on: '2026-11-12',
        ends_on: '2026-11-12',
        owner_name: 'Ana',
      }),
    ).toMatchObject({ status: 'pending', placeName: 'Termas Geométricas', ownerName: 'Ana' })
    let calls = 0
    const rpc: Rpc = async () => {
      calls += 1
      return { data: null, error: null }
    }
    expect(await loadMyOutingInvite(rpc, 'no-es-uuid')).toBeNull()
    expect(calls).toBe(0)
  })
})

describe('loadMyMap', () => {
  test('un error de lectura no es un mapa vacío', async () => {
    const rpc: Rpc = async () => ({ data: { pins: [], plans: [] }, error: { message: 'boom' } })
    expect(await loadMyMap(rpc)).toEqual({ ok: false })
  })
})
