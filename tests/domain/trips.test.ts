import { describe, expect, test } from 'vitest'
import { tripSpan } from '@/domain/trips'

describe('viaje', () => {
  test('dos paradas en meses distintos abarcan del primero al último día', () => {
    expect(
      tripSpan([
        { startsOn: '2026-11-10', endsOn: '2026-11-12' },
        { startsOn: '2026-12-01', endsOn: '2026-12-04' },
      ]),
    ).toEqual({ startsOn: '2026-11-10', endsOn: '2026-12-04' })
  })

  test('una sola parada también tiene span', () => {
    expect(tripSpan([{ startsOn: '2026-11-10', endsOn: '2026-11-12' }])).toEqual({
      startsOn: '2026-11-10',
      endsOn: '2026-11-12',
    })
  })

  test('sin paradas no hay span', () => {
    expect(tripSpan([])).toBeNull()
  })
})
