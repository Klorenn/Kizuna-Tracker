/** What this device can do with web push. Pure: the browser facts are read in the component. */
export type PushEnv = {
  /** serviceWorker, PushManager and Notification all exist. */
  hasPush: boolean
  /** NEXT_PUBLIC_VAPID_PUBLIC_KEY is configured. */
  vapid: boolean
  /** Running as the installed app. */
  standalone: boolean
  /** iPhone or iPad Safari: push only works from the home screen app. */
  ios: boolean
  permission: 'default' | 'granted' | 'denied' | null
  /** This device has a push subscription. */
  subscribed: boolean
  /** The server has the row for this device's endpoint (read with the user's own session). */
  registered: boolean
}

export type PushStatus = 'on' | 'off' | 'blocked' | 'unsupported' | 'install'

export function pushStatus(env: PushEnv): PushStatus {
  if (env.ios && !env.standalone) return 'install'
  if (!env.hasPush || !env.vapid) return 'unsupported'
  if (env.permission === 'denied') return 'blocked'
  if (env.permission === 'granted' && env.subscribed && env.registered) return 'on'
  return 'off'
}

export const PUSH_STATUS_COPY: Readonly<Record<PushStatus, { label: string; hint: string }>> = {
  on: { label: 'Activadas', hint: 'Te avisamos de tus recordatorios y retos en este dispositivo.' },
  off: { label: 'Desactivadas', hint: 'Actívalas para recibir tus recordatorios en este dispositivo.' },
  blocked: { label: 'Bloqueadas', hint: 'Las bloqueaste para Kizuna. Actívalas en los ajustes del dispositivo.' },
  unsupported: { label: 'No disponible en este navegador', hint: 'Prueba desde la app instalada o desde otro navegador.' },
  install: { label: 'Instala la app primero', hint: 'En iPhone, los avisos solo llegan si Kizuna está en tu pantalla de inicio.' },
}

/** What the user reads when "Activar" does not end in 'on'. */
export const ENABLE_PUSH_MESSAGE = {
  denied: 'Bloqueaste los avisos. Puedes activarlos en los ajustes del navegador.',
  unavailable: 'No disponible en este navegador por ahora.',
  error: 'No pudimos activar los avisos. Inténtalo de nuevo.',
} as const

/** `navigator.serviceWorker.ready` never settles without a worker: give up after this. */
export const SW_READY_TIMEOUT_MS = 4000

/** Resolves with the promise's value, or 'timeout' after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve('timeout'), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}
