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
}

export type PushStatus = 'on' | 'off' | 'blocked' | 'unsupported' | 'install'

export function pushStatus(env: PushEnv): PushStatus {
  if (env.ios && !env.standalone) return 'install'
  if (!env.hasPush || !env.vapid) return 'unsupported'
  if (env.permission === 'denied') return 'blocked'
  if (env.permission === 'granted' && env.subscribed) return 'on'
  return 'off'
}

export const PUSH_STATUS_COPY: Readonly<Record<PushStatus, { label: string; hint: string }>> = {
  on: { label: 'Activadas', hint: 'Te avisamos de tus recordatorios y retos en este dispositivo.' },
  off: { label: 'Desactivadas', hint: 'Actívalas para recibir tus recordatorios en este dispositivo.' },
  blocked: { label: 'Bloqueadas', hint: 'Las bloqueaste para Kizuna. Actívalas en los ajustes del dispositivo.' },
  unsupported: { label: 'No disponible en este navegador', hint: 'Prueba desde la app instalada o desde otro navegador.' },
  install: { label: 'Instala la app primero', hint: 'En iPhone, los avisos solo llegan si Kizuna está en tu pantalla de inicio.' },
}
