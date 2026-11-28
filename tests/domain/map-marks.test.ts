import { describe, expect, test } from 'vitest'
import { frameTarget, mapMarks, mapPinCollection } from '@/domain/map-marks'

describe('marcas del mapa', () => {
  test('un lugar visitado queda en color y uno planeado no', () => {
    const marks = mapMarks({
      visited: [{ id: 'a', lat: -33.4, lng: -70.6, title: 'Santiago', address: ' Santiago, Chile ' }],
      planned: [
        { id: 'a', lat: -33.4, lng: -70.6, title: 'Santiago' },
        { id: 'b', lat: -41.4, lng: -72.9, title: 'Puerto Varas' },
      ],
    })
    expect(marks).toEqual([
      { id: 'a', lat: -33.4, lng: -70.6, title: 'Santiago', visited: true, address: 'Santiago, Chile' },
      { id: 'b', lat: -41.4, lng: -72.9, title: 'Puerto Varas', visited: false, address: null },
    ])
    expect(mapPinCollection(marks).features.map((feature) => feature.properties.visited)).toEqual([true, false])
    expect(mapPinCollection(marks).features.map((feature) => feature.properties.id)).toEqual(['a', 'b'])
  })

  test('un solo lugar abre encima de ese punto, no del país', () => {
    expect(frameTarget([])).toEqual({ kind: 'empty' })
    expect(frameTarget([{ lat: -39.27, lng: -71.98 }])).toEqual({ kind: 'place', lng: -71.98, lat: -39.27, zoom: 10 })
    expect(frameTarget([{ lat: -33.4, lng: -70.6 }, { lat: -41.4, lng: -72.9 }])).toEqual({ kind: 'places', zoomCap: 10 })
  })
})
