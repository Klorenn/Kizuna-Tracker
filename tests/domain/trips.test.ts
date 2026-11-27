import { describe, expect, test } from 'vitest'
import { parseTripLink, tripLinkLabel, tripSpan } from '@/domain/trips'

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

describe('link del viaje', () => {
  test('un link de Drive queda en https', () => {
    expect(parseTripLink('  https://drive.google.com/drive/folders/abc  ')).toEqual({
      ok: true,
      link: 'https://drive.google.com/drive/folders/abc',
    })
    expect(tripLinkLabel('https://drive.google.com/drive/folders/abc')).toBe('Abrir en Drive')
  })

  test('vacío lo quita', () => {
    expect(parseTripLink('   ')).toEqual({ ok: true, link: null })
  })

  test('http y un link con clave no entran', () => {
    expect(parseTripLink('http://drive.google.com/x').ok).toBe(false)
    expect(parseTripLink('https://user:secret@drive.google.com/x').ok).toBe(false)
  })
})
