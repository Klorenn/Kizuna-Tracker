import { isNativeUA } from '@/lib/native-shell'
import { sanitizeMessage, sanitizePath, sanitizeStack } from './sanitize'

export const MAX_BODY_BYTES = 8192
export const KINDS = ['error', 'unhandledrejection', 'react', 'server'] as const
export type ErrorKind = (typeof KINDS)[number]

export type ErrorReport = { kind: ErrorKind; message: string; stack: string | null; path: string }
const KEYS = new Set(['kind', 'message', 'stack', 'path'])
// raw limits: well above what is kept, so a normal report fits and junk is refused rather than silently stored
const RAW = { message: 4000, stack: 7000, path: 1000 }

type Shape = { kind: ErrorKind; message: string; stack?: string; path?: string }

/** Structure only, no regex and no sanitizing: JSON shape, key allowlist, types and raw length caps. */
export function checkShape(body: unknown): { ok: true; value: Shape } | { ok: false } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false }
  const b = body as Record<string, unknown>
  if (Object.keys(b).some((k) => !KEYS.has(k))) return { ok: false }
  if (typeof b.kind !== 'string' || !(KINDS as readonly string[]).includes(b.kind)) return { ok: false }
  if (typeof b.message !== 'string' || b.message.length === 0 || b.message.length > RAW.message) return { ok: false }
  if (b.stack !== undefined && (typeof b.stack !== 'string' || b.stack.length > RAW.stack)) return { ok: false }
  if (b.path !== undefined && (typeof b.path !== 'string' || b.path.length > RAW.path)) return { ok: false }
  return { ok: true, value: { kind: b.kind as ErrorKind, message: b.message, stack: b.stack as string | undefined, path: b.path as string | undefined } }
}

/** Redact, truncate and normalize an already shape-checked report. */
export function sanitizeShape(v: Shape): ErrorReport {
  return { kind: v.kind, message: sanitizeMessage(v.message), stack: sanitizeStack(v.stack), path: sanitizePath(v.path) }
}

export function validatePayload(body: unknown): { ok: true; value: ErrorReport } | { ok: false } {
  const s = checkShape(body)
  if (!s.ok) return { ok: false }
  if (s.value.message.trim() === '') return { ok: false }
  return { ok: true, value: sanitizeShape(s.value) }
}

const NATIVE_VERSION = /(?:^|\s)KizunaNative\/(\d+)/

export function parseUa(ua: string | null | undefined): { uaKind: 'native' | 'browser'; appVersion: string | null } {
  if (!isNativeUA(ua)) return { uaKind: 'browser', appVersion: null }
  return { uaKind: 'native', appVersion: NATIVE_VERSION.exec(ua as string)?.[1] ?? null }
}
