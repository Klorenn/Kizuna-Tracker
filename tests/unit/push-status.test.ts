import { afterEach, describe, expect, test, vi } from 'vitest'
import { ENABLE_PUSH_MESSAGE, PUSH_STATUS_COPY, SW_READY_TIMEOUT_MS, pushStatus, withTimeout, type PushEnv } from '@/lib/push-status'

const base: PushEnv = {
  hasPush: true,
  vapid: true,
  standalone: false,
  ios: false,
  permission: 'default',
  subscribed: false,
  registered: false,
}

describe('pushStatus', () => {
  test('en iPhone fuera de la app instalada pide instalar primero', () => {
    expect(pushStatus({ ...base, ios: true, hasPush: false })).toBe('install')
    expect(pushStatus({ ...base, ios: true })).toBe('install')
  })
  test('en iPhone con la app instalada sigue el permiso', () => {
    expect(pushStatus({ ...base, ios: true, standalone: true })).toBe('off')
  })
  test('sin Push API o sin llave pública no está disponible', () => {
    expect(pushStatus({ ...base, hasPush: false })).toBe('unsupported')
    expect(pushStatus({ ...base, vapid: false })).toBe('unsupported')
  })
  test('permiso bloqueado', () => {
    expect(pushStatus({ ...base, permission: 'denied' })).toBe('blocked')
  })
  test('activadas solo con permiso, suscripción en este dispositivo y la fila en el servidor', () => {
    expect(pushStatus({ ...base, permission: 'granted', subscribed: true, registered: true })).toBe('on')
    expect(pushStatus({ ...base, permission: 'granted', subscribed: true, registered: false })).toBe('off')
    expect(pushStatus({ ...base, permission: 'granted', subscribed: false, registered: true })).toBe('off')
    expect(pushStatus({ ...base, permission: 'default' })).toBe('off')
  })
})

describe('PUSH_STATUS_COPY', () => {
  test('cada estado tiene etiqueta y explicación', () => {
    expect(PUSH_STATUS_COPY.on.label).toBe('Activadas')
    expect(PUSH_STATUS_COPY.off.label).toBe('Desactivadas')
    expect(PUSH_STATUS_COPY.unsupported.label).toBe('No disponible en este navegador')
    expect(PUSH_STATUS_COPY.install.label).toBe('Instala la app primero')
    for (const s of Object.values(PUSH_STATUS_COPY)) expect(s.hint.length).toBeGreaterThan(0)
  })
})

describe('activar avisos', () => {
  afterEach(() => vi.useRealTimers())
  test('mensajes claros para permiso negado, no disponible y error', () => {
    expect(ENABLE_PUSH_MESSAGE.unavailable).toBe('No disponible en este navegador por ahora.')
    expect(ENABLE_PUSH_MESSAGE.denied).toMatch(/bloqueaste/i)
    expect(ENABLE_PUSH_MESSAGE.error).toBe('No pudimos activar los avisos. Inténtalo de nuevo.')
  })
  test('serviceWorker.ready espera como máximo 4 s', async () => {
    expect(SW_READY_TIMEOUT_MS).toBe(4000)
    vi.useFakeTimers()
    const never = new Promise<string>(() => {})
    const r = withTimeout(never, 4000)
    vi.advanceTimersByTime(4000)
    await expect(r).resolves.toBe('timeout')
    await expect(withTimeout(Promise.resolve('ok'), 4000)).resolves.toBe('ok')
  })
})
