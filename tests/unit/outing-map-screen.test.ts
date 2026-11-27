import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { mapScreen } from '@/domain/outings'

describe('mapScreen', () => {
  test('una lectura fallida no es un cero ni un mapa vacío', () => {
    expect(mapScreen({ monthOk: false, mapOk: true, completed: 0, outingCount: 0, pinCount: 0 })).toEqual({
      kind: 'error',
    })
    expect(mapScreen({ monthOk: true, mapOk: false, completed: 2, outingCount: 2, pinCount: 2 })).toEqual({
      kind: 'error',
    })
  })

  test('sin salidas y sin pines es el vacío, con el piso real', () => {
    expect(mapScreen({ monthOk: true, mapOk: true, completed: 0, outingCount: 0, pinCount: 0 })).toEqual({
      kind: 'empty',
      floorLabel: '0 de 1',
    })
  })

  test('pines viejos con el mes vacío siguen siendo el mapa', () => {
    expect(mapScreen({ monthOk: true, mapOk: true, completed: 0, outingCount: 0, pinCount: 2 })).toEqual({
      kind: 'ready',
      floorLabel: '0 de 1',
      showMonthEmptyCopy: true,
    })
  })

  test('con salidas del mes está listo', () => {
    expect(mapScreen({ monthOk: true, mapOk: true, completed: 3, outingCount: 4, pinCount: 3 }).kind).toBe('ready')
  })
})

describe('la pantalla no pide ubicación ni token', () => {
  test('el fuente del mapa no lee el dispositivo ni un proveedor con clave', () => {
    const files = [
      'src/components/map/OutingMap.tsx',
      'src/components/map/OutingForm.tsx',
      'src/app/(app)/mapa/page.tsx',
      'src/app/api/places/search/route.ts',
    ]
    const src = files.map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(src.toLowerCase()).not.toContain('geolocation')
    expect(src).not.toContain('exif')
    expect(src).not.toContain('tile.openstreetmap.org')
    expect(src).not.toContain('MAPBOX')
    expect(src).not.toContain('process.env')
  })
})
