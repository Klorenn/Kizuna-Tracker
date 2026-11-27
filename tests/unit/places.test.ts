import { describe, expect, test } from 'vitest'
import type { PlacePick } from '@/domain/outings'
import { cityOutline, cityZones, PlaceSearchError, placeSearchResponse, searchPlaces } from '@/lib/places'

const nominatimHit = {
  name: 'Termas Geométricas',
  osm_type: 'way',
  osm_id: 281946924,
  lat: '-39.5735',
  lon: '-71.7892',
  display_name: 'Termas Geométricas, Coñaripe, Panguipulli, Valdivia, Los Ríos, Chile',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('searchPlaces', () => {
  test('una consulta corta no llama a la red', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      return jsonResponse([])
    }
    await expect(searchPlaces('  te ', fetchImpl)).resolves.toEqual([])
    expect(calls).toBe(0)
  })

  test('Nominatim busca en Chile e identifica a Kizuna', async () => {
    const urls: string[] = []
    const headers: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      urls.push(String(input))
      headers.push(new Headers(init?.headers).get('User-Agent') ?? '')
      return jsonResponse([nominatimHit])
    }
    const places = await searchPlaces('Termas', fetchImpl)
    expect(urls[0]).toContain('countrycodes=cl')
    expect(urls[0]).toContain('nominatim.openstreetmap.org')
    expect(headers[0]).toContain('Kizuna')
    expect(places).toEqual([
      {
        name: 'Termas Geométricas',
        detail: 'Coñaripe, Panguipulli, Valdivia, Los Ríos, Chile',
        placeKey: 'nominatim:way:281946924',
        lat: -39.5735,
        lng: -71.7892,
      },
    ] satisfies PlacePick[])
  })

  test('sin osm_id la clave es la coordenada', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse([{ ...nominatimHit, osm_id: undefined, osm_type: undefined }])
    const places = await searchPlaces('Termas', fetchImpl)
    expect(places[0]?.placeKey).toBe('coord:-39.57350:-71.78920')
  })

  test('si Nominatim limita, Photon deja solo Chile y invierte GeoJSON', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.includes('nominatim')) return jsonResponse({ error: 'slow' }, 429)
      return jsonResponse({
        features: [
          {
            geometry: { type: 'Point', coordinates: [-71.98, -39.27] },
            properties: { name: 'Pucón', countrycode: 'CL', osm_type: 'N', osm_id: 7 },
          },
          {
            geometry: { type: 'Point', coordinates: [-58.38, -34.6] },
            properties: { name: 'Buenos Aires', countrycode: 'AR', osm_type: 'N', osm_id: 8 },
          },
        ],
      })
    }
    const places = await searchPlaces('Pucón', fetchImpl)
    expect(places).toEqual([
      {
        name: 'Pucón',
        detail: null,
        placeKey: 'nominatim:node:7',
        lat: -39.27,
        lng: -71.98,
      },
    ])
  })

  test('si los dos proveedores fallan, es un error', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes('nominatim')) return jsonResponse({}, 429)
      throw new Error('photon down')
    }
    await expect(searchPlaces('Pucón', fetchImpl)).rejects.toBeInstanceOf(PlaceSearchError)
  })

  test('una lista vacía de Nominatim no es un error', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls += 1
      return jsonResponse([])
    }
    await expect(searchPlaces('Termas', fetchImpl)).resolves.toEqual([])
    expect(calls).toBe(2)
  })

  test('Temuco ofrece la ciudad y las otras coincidencias de Chile', async () => {
    const urls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('nominatim')) {
        return jsonResponse([
          {
            name: 'Temuco',
            osm_type: 'relation',
            osm_id: 1,
            lat: '-38.7359',
            lon: '-72.5904',
            display_name: 'Temuco, Provincia de Cautín, Región de la Araucanía, Chile',
          },
        ])
      }
      return jsonResponse({
        features: [
          {
            geometry: { type: 'Point', coordinates: [-72.5905, -38.7359] },
            properties: { name: 'Temuco', countrycode: 'CL', osm_type: 'R', osm_id: 1, osm_value: 'city', state: 'Región de la Araucanía' },
          },
          {
            geometry: { type: 'Point', coordinates: [-72.5792, -38.7369] },
            properties: { name: 'Temuco', countrycode: 'CL', osm_type: 'N', osm_id: 2, osm_value: 'station', state: 'Región de la Araucanía' },
          },
          {
            geometry: { type: 'Point', coordinates: [-73.05, -36.82] },
            properties: { name: 'Temuco', countrycode: 'CL', osm_type: 'W', osm_id: 3, osm_value: 'residential', state: 'Región del Biobío' },
          },
          {
            geometry: { type: 'Point', coordinates: [2.35, 48.86] },
            properties: { name: 'Temuco', countrycode: 'FR', osm_type: 'N', osm_id: 9, osm_value: 'city', state: 'Île-de-France' },
          },
        ],
      })
    }
    const places = await searchPlaces('Temuco', fetchImpl)
    expect(urls.some((url) => url.includes('lang=default'))).toBe(true)
    expect(urls.some((url) => url.includes('lang=es'))).toBe(false)
    expect(places.map((place) => place.detail)).toEqual([
      'Provincia de Cautín, Región de la Araucanía, Chile',
      'Estación · Región de la Araucanía',
      'Calle · Región del Biobío',
    ])
  })
})

describe('cityOutline', () => {
  const city = {
    osm_type: 'relation',
    osm_id: 1767300,
    geojson: {
      type: 'Polygon',
      coordinates: [[
        [-72.72, -38.68],
        [-72.5, -38.7],
        [-72.46, -38.8],
        [-72.62, -38.86],
        [-72.78, -38.78],
        [-72.72, -38.68],
      ]],
    },
  }

  test('pide el contorno de la comuna y conserva la forma', async () => {
    const urls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input))
      return jsonResponse(city)
    }
    const outline = await cityOutline(-38.7359, -72.5904, fetchImpl)
    expect(urls[0]).toContain('polygon_geojson=1')
    expect(urls[0]).toContain('zoom=10')
    expect(outline?.id).toBe('relation:1767300')
    expect(outline?.polygons[0][0][2]).toEqual([-72.46, -38.8])
    expect(urls).toHaveLength(1)
  })

  test('una región enorme no cuenta y prueba el zoom de pueblo', async () => {
    const urls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('zoom=10')) {
        return jsonResponse({
          osm_type: 'relation',
          osm_id: 1,
          geojson: {
            type: 'Polygon',
            coordinates: [[[-74, -37], [-70, -37], [-70, -40], [-74, -40], [-74, -37]]],
          },
        })
      }
      return jsonResponse(city)
    }
    const outline = await cityOutline(-38.73, -72.59, fetchImpl)
    expect(urls.map((url) => url.includes('zoom=12'))).toContain(true)
    expect(outline?.id).toBe('relation:1767300')
  })

  test('dos visitas a la misma comuna pintan una sola zona', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(city)
    const zones = await cityZones(
      [
        { lat: -38.73, lng: -72.59 },
        { lat: -38.74, lng: -72.58 },
      ],
      fetchImpl,
    )
    expect(zones).toHaveLength(1)
  })
})

describe('placeSearchResponse', () => {
  test('sin sesión no busca', async () => {
    let calls = 0
    const search = async () => {
      calls += 1
      return []
    }
    const result = await placeSearchResponse(null, 'Pucón', search)
    expect(result.status).toBe(401)
    expect(calls).toBe(0)
  })

  test('con sesión devuelve los lugares', async () => {
    const places: PlacePick[] = [
      { name: 'Pucón', detail: null, placeKey: 'nominatim:node:1', lat: -39.27, lng: -71.98 },
    ]
    const result = await placeSearchResponse({ userId: 'u1' }, 'Pucón', async () => places)
    expect(result).toEqual({ status: 200, body: { places } })
  })

  test('un proveedor caído responde 502', async () => {
    const result = await placeSearchResponse({ userId: 'u1' }, 'Pucón', async () => {
      throw new PlaceSearchError()
    })
    expect(result).toEqual({
      status: 502,
      body: { error: 'No pudimos buscar lugares. Inténtalo de nuevo.' },
    })
  })
})
