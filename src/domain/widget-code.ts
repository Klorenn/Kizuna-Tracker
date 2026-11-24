import { formatDistanceStrict } from 'date-fns'
import { es } from 'date-fns/locale'

/** A person can have at most this many connected devices (enforced by widget_pair; the UI explains it). */
export const WIDGET_DEVICE_CAP = 3

/** The code as shown: `ABCD-EFGH`. Anything that is not 8 characters (after dropping spaces and hyphens) is only upper-cased. */
export function formatPairingCode(code: string): string {
  const clean = code.replace(/[\s-]/g, '').toUpperCase()
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
}

export function isAndroidUserAgent(ua: string | null | undefined): boolean {
  return /\bAndroid\b/i.test(ua ?? '')
}

/** "Conectado hace 4 días · usado hace 3 horas" (the caller gives `now`, so server and client agree). */
export function deviceMeta(createdAt: string, lastUsedAt: string | null, now: Date): string {
  const ago = (iso: string) => formatDistanceStrict(new Date(iso), now, { locale: es, addSuffix: true })
  return `Conectado ${ago(createdAt)} · ${lastUsedAt ? `usado ${ago(lastUsedAt)}` : 'sin uso todavía'}`
}
