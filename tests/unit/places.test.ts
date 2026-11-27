import { describe, expect, test } from 'vitest'
import type { PlacePick } from '@/domain/outings'
import { PlaceSearchError, placeSearchResponse, searchPlaces } from '@/lib/places'

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
    expect(calls).toBe(1)
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
