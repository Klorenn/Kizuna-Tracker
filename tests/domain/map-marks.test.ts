import { describe, expect, test } from 'vitest'
import { mapMarks, mapPinCollection } from '@/domain/map-marks'

describe('marcas del mapa', () => {
  test('un lugar visitado queda en color y uno planeado no', () => {
    const marks = mapMarks({
      visited: [{ id: 'a', lat: -33.4, lng: -70.6, title: 'Santiago' }],
      planned: [
        { id: 'a', lat: -33.4, lng: -70.6, title: 'Santiago' },
        { id: 'b', lat: -41.4, lng: -72.9, title: 'Puerto Varas' },
      ],
    })
    expect(marks).toEqual([
      { id: 'a', lat: -33.4, lng: -70.6, title: 'Santiago', visited: true },
      { id: 'b', lat: -41.4, lng: -72.9, title: 'Puerto Varas', visited: false },
    ])
    expect(mapPinCollection(marks).features.map((feature) => feature.properties.visited)).toEqual([true, false])
  })
})
