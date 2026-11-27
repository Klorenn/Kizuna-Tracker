import { describe, expect, test } from 'vitest'
import {
  canMarkWent,
  coordPlaceKey,
  currentMonthStart,
  datesInsideMonth,
  isPlaceKey,
  monthEndOf,
  monthFloor,
  monthIndexLabel,
  monthLabel,
  monthRowValue,
  monthStartOf,
  cleanGuestName,
  planLine,
  upcomingMonthStarts,
  outingTitle,
  shiftMonth,
  validateOutingDraft,
  visitCounts,
  visitLabel,
  type PlacePick,
} from '@/domain/outings'

const place: PlacePick = {
  name: 'Termas Geométricas',
  detail: 'Coñaripe, Los Ríos',
  placeKey: 'nominatim:way:281946924',
  lat: -39.5735,
  lng: -71.7892,
}

describe('mes civil', () => {
  test('el día 1 y el último día', () => {
    expect(monthStartOf('2026-11-26')).toBe('2026-11-01')
    expect(monthEndOf('2026-11-01')).toBe('2026-11-30')
    expect(monthEndOf('2028-02-10')).toBe('2028-02-29')
    expect(monthEndOf('2027-02-10')).toBe('2027-02-28')
    expect(monthEndOf('2026-12-02')).toBe('2026-12-31')
  })

  test('la zona manda, no UTC', () => {
    expect(currentMonthStart(new Date('2026-11-01T02:30:00Z'), 'America/Santiago')).toBe('2026-10-01')
    expect(currentMonthStart(new Date('2026-11-01T03:30:00Z'), 'America/Santiago')).toBe('2026-11-01')
  })

  test('las dos fechas caen en el mes', () => {
    expect(datesInsideMonth('2026-11-01', '2026-11-30', '2026-11-01')).toBe(true)
    expect(datesInsideMonth('2026-11-30', '2026-12-01', '2026-11-01')).toBe(false)
    expect(datesInsideMonth('2026-11-10', '2026-11-09', '2026-11-01')).toBe(false)
  })

  test('el nombre del mes va en sentence case', () => {
    expect(monthLabel('2026-11-01')).toBe('Noviembre')
  })
})

describe('piso', () => {
  test('el denominador se queda en 1', () => {
    expect(monthFloor(0)).toEqual({ completed: 0, floor: 1, met: false, label: '0 de 1' })
    expect(monthFloor(1)).toEqual({ completed: 1, floor: 1, met: true, label: '1 de 1' })
    expect(monthFloor(3)).toEqual({ completed: 3, floor: 1, met: true, label: '3 de 1' })
    expect(monthFloor(-1).label).toBe('0 de 1')
    expect(monthFloor(1.5).label).toBe('0 de 1')
  })

  test('una lectura fallida no es un cero', () => {
    expect(monthRowValue({ ok: false })).toBeNull()
    expect(monthRowValue({ ok: true, completed: 0 })).toBe('0 de 1')
  })
})

describe('Fui', () => {
  test('desde el primer día inclusive hasta el cierre del mes', () => {
    expect(canMarkWent('2026-11-12', '2026-11-12', '2026-11-01')).toBe(true)
    expect(canMarkWent('2026-11-11', '2026-11-12', '2026-11-01')).toBe(false)
    expect(canMarkWent('2026-11-30', '2026-11-12', '2026-11-01')).toBe(true)
    expect(canMarkWent('2026-12-01', '2026-11-12', '2026-11-01')).toBe(false)
  })
})

describe('título y lugar', () => {
  test('el acompañante entra al título solo si aceptó', () => {
    expect(outingTitle('Termas Geométricas', null)).toBe('Termas Geométricas')
    expect(outingTitle('Termas Geométricas', { name: 'Sofía', status: 'pending' })).toBe('Termas Geométricas')
    expect(outingTitle('Termas Geométricas', { name: 'Sofía', status: 'accepted' })).toBe(
      'Termas Geométricas, con Sofía',
    )
  })

  test('la clave de lugar tiene una sola forma', () => {
    expect(isPlaceKey('nominatim:way:281946924')).toBe(true)
    expect(isPlaceKey('nominatim:node:1')).toBe(true)
    expect(isPlaceKey(coordPlaceKey(-39.27, -71.98))).toBe(true)
    expect(coordPlaceKey(-39.27, -71.98)).toBe('coord:-39.27000:-71.98000')
    expect(isPlaceKey('groups:1')).toBe(false)
    expect(isPlaceKey('nominatim:way:x')).toBe(false)
  })

  test('el borrador rechaza lugar, fechas y nota', () => {
    const month = '2026-11-01'
    expect(validateOutingDraft({ place, startsOn: '2026-11-12', endsOn: '2026-11-14', note: '', month })).toEqual({
      ok: true,
    })
    expect(validateOutingDraft({ place: null, startsOn: '2026-11-12', endsOn: '2026-11-14', note: '', month })).toMatchObject({
      ok: false,
      field: 'place',
    })
    expect(
      validateOutingDraft({ place, startsOn: '2026-11-30', endsOn: '2026-12-01', note: '', month }),
    ).toMatchObject({ ok: false, field: 'dates', error: 'Esas fechas no caben en este mes.' })
    expect(
      validateOutingDraft({ place, startsOn: '2026-11-12', endsOn: '2026-11-14', note: 'a'.repeat(281), month }),
    ).toMatchObject({ ok: false, field: 'note' })
  })
})

describe('meses pasados', () => {
  test('el índice une el mes y el piso', () => {
    expect(monthIndexLabel('2026-11-01', 0)).toBe('Noviembre · 0 de 1')
    expect(monthIndexLabel('2026-10-01', 2)).toBe('Octubre · 2 de 1')
  })
})

describe('repetir', () => {
  test('el mismo día del mes siguiente, y el último si ese día no existe', () => {
    expect(shiftMonth('2026-11-12')).toBe('2026-12-12')
    expect(shiftMonth('2026-01-31')).toBe('2026-02-28')
    expect(shiftMonth('2028-01-31')).toBe('2028-02-29')
    expect(shiftMonth('2026-12-02')).toBe('2027-01-02')
  })
})

describe('conteo por lugar', () => {
  test('agrupa por clave y el nombre es el de la primera vez', () => {
    const counts = visitCounts([
      { placeKey: 'nominatim:node:1', placeName: 'Pucón' },
      { placeKey: 'nominatim:node:1', placeName: 'Pucon' },
      { placeKey: 'nominatim:way:2', placeName: 'Termas Geométricas' },
    ])
    expect(counts.get('nominatim:node:1')).toEqual({ placeName: 'Pucón', times: 2 })
    expect(counts.get('nominatim:way:2')).toEqual({ placeName: 'Termas Geométricas', times: 1 })
    expect(visitLabel('Pucón', 1)).toBe('Pucón · 1 vez')
    expect(visitLabel('Pucón', 2)).toBe('Pucón · 2 veces')
    expect(visitLabel('Pucón', 3)).toBe('Pucón · 3 veces')
  })
})

describe('planes', () => {
  test('desde noviembre se puede llegar a enero', () => {
    expect(upcomingMonthStarts('2026-11-27', 3)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })

  test('un nombre vacío no acompaña, y uno largo no pasa', () => {
    expect(cleanGuestName('  ')).toEqual({ ok: true, name: null })
    expect(cleanGuestName('  Mamá  ')).toEqual({ ok: true, name: 'Mamá' })
    expect(cleanGuestName('a'.repeat(41)).ok).toBe(false)
  })

  test('la línea del checklist nombra a la persona', () => {
    expect(planLine('Puerto Natales', null)).toBe('Puerto Natales')
    expect(planLine('Puerto Natales', 'Mamá')).toBe('Puerto Natales · con Mamá')
  })
})
