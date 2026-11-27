import { describe, expect, test } from 'vitest'
import { bondStat, distinctPlaces, tripChipForToday } from '@/domain/outing-memory'

describe('memoria', () => {
  test('un lugar en singular y varios en plural; cero no se muestra', () => {
    expect(bondStat('Sofía', 1)).toBe('Con Sofía: 1 lugar')
    expect(bondStat('Sofía', 4)).toBe('Con Sofía: 4 lugares')
    expect(bondStat('Sofía', 0)).toBeNull()
    expect(bondStat('Sofía', -1)).toBeNull()
  })

  test('cuenta claves distintas con Fui y ese acompañante', () => {
    const rows = [
      { placeKey: 'nominatim:node:1', status: 'went' as const, companionId: 'sofia' },
      { placeKey: 'nominatim:node:1', status: 'went' as const, companionId: 'sofia' },
      { placeKey: 'nominatim:node:2', status: 'went' as const, companionId: 'sofia' },
      { placeKey: 'nominatim:node:3', status: 'planned' as const, companionId: 'sofia' },
      { placeKey: 'nominatim:node:4', status: 'went' as const, companionId: 'otra' },
      { placeKey: 'nominatim:node:5', status: 'went' as const, companionId: null },
    ]
    expect(distinctPlaces(rows, 'sofia')).toBe(2)
    expect(distinctPlaces(rows, 'otra')).toBe(1)
    expect(distinctPlaces(rows, 'nadie')).toBe(0)
  })
})

describe('chip de viaje', () => {
  const trips = [
    {
      id: 'late',
      name: 'Sur',
      stops: [
        { startsOn: '2026-11-20', endsOn: '2026-11-22' },
        { startsOn: '2026-11-28', endsOn: '2026-12-02' },
      ],
    },
    {
      id: 'early',
      name: 'Lagos',
      stops: [{ startsOn: '2026-11-10', endsOn: '2026-11-18' }],
    },
  ]

  test('hoy dentro del rango, hoy fuera, y si hay dos gana el que empieza antes', () => {
    expect(tripChipForToday(trips, '2026-11-12')).toEqual({ tripId: 'early', name: 'Lagos' })
    expect(tripChipForToday(trips, '2026-11-21')).toEqual({ tripId: 'late', name: 'Sur' })
    expect(tripChipForToday(trips, '2026-12-01')).toEqual({ tripId: 'late', name: 'Sur' })
    expect(tripChipForToday(trips, '2026-10-01')).toBeNull()
    expect(
      tripChipForToday(
        [
          { id: 'b', name: 'B', stops: [{ startsOn: '2026-11-12', endsOn: '2026-11-20' }] },
          { id: 'a', name: 'A', stops: [{ startsOn: '2026-11-01', endsOn: '2026-11-30' }] },
        ],
        '2026-11-15',
      ),
    ).toEqual({ tripId: 'a', name: 'A' })
  })
})
