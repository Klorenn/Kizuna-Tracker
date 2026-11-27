import { describe, expect, test } from 'vitest'
import { boundaryFeatureCollection, outlineSpanKm, polygonsFromGeoJson } from '@/domain/map-zone'

const temuco = {
  type: 'Polygon',
  coordinates: [[
    [-72.72, -38.68],
    [-72.5, -38.7],
    [-72.46, -38.8],
    [-72.62, -38.86],
    [-72.78, -38.78],
    [-72.72, -38.68],
  ]],
}

describe('contorno de la ciudad', () => {
  test('un polígono se queda con su forma y cierra', () => {
    const polygons = polygonsFromGeoJson(temuco)
    expect(polygons).toHaveLength(1)
    expect(polygons[0][0][0]).toEqual(polygons[0][0][polygons[0][0].length - 1])
    expect(polygons[0][0][1]).toEqual([-72.5, -38.7])
  })

  test('un punto no es una ciudad', () => {
    expect(polygonsFromGeoJson({ type: 'Point', coordinates: [-72.59, -38.73] })).toEqual([])
  })

  test('el ancho descarta una región entera', () => {
    const city = polygonsFromGeoJson(temuco)
    expect(outlineSpanKm(city)).toBeGreaterThan(10)
    expect(outlineSpanKm(city)).toBeLessThan(80)
    const region = polygonsFromGeoJson({
      type: 'Polygon',
      coordinates: [[[-74, -37], [-70, -37], [-70, -40], [-74, -40], [-74, -37]]],
    })
    expect(outlineSpanKm(region)).toBeGreaterThan(80)
  })

  test('el mapa pinta ese polígono', () => {
    const collection = boundaryFeatureCollection([{ id: 'relation:1', polygons: polygonsFromGeoJson(temuco) }])
    expect(collection.features).toHaveLength(1)
    expect(collection.features[0].geometry.coordinates[0][2]).toEqual([-72.46, -38.8])
  })
})
