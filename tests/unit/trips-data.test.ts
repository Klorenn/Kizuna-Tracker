import { describe, expect, test } from 'vitest'
import { parseTripsPayload } from '@/lib/trips-data'

const id = '6b0e0c6a-3e3e-4e3e-8e3e-3e3e3e3e3e3e'

describe('parseTripsPayload', () => {
  test('el link y el dueño viajan con el viaje', () => {
    expect(
      parseTripsPayload([
        {
          id,
          name: 'Sur',
          link: 'https://drive.google.com/drive/folders/abc',
          is_owner: true,
          stops: [],
        },
      ]),
    ).toEqual([
      {
        id,
        name: 'Sur',
        link: 'https://drive.google.com/drive/folders/abc',
        isOwner: true,
        stops: [],
      },
    ])
  })

  test('sin link queda vacío y un http invalida la lista', () => {
    expect(parseTripsPayload([{ id, name: 'Sur', link: null, is_owner: false, stops: [] }])).toEqual([
      { id, name: 'Sur', link: null, isOwner: false, stops: [] },
    ])
    expect(parseTripsPayload([{ id, name: 'Sur', link: 'http://drive.google.com/x', is_owner: true, stops: [] }])).toBeNull()
  })
})
