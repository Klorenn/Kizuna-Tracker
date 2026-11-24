import type { TodayItem } from './today'

/** Shown when the action could not even reach the server (offline, dropped connection). */
export const TOGGLE_FAILED = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'

export type TogglePlan = { run: false } | { run: true; action: 'do' | 'undo'; optimistic: boolean }

/**
 * What a tap does: flip the confirmed state, showing the flip at once. A tap while the previous one
 * is still in flight does nothing (it would repeat the action: a second undo would answer "nothing to undo").
 */
export function planToggle(confirmed: boolean, pending: boolean): TogglePlan {
  if (pending) return { run: false }
  return confirmed ? { run: true, action: 'undo', optimistic: false } : { run: true, action: 'do', optimistic: true }
}

export type ToggleOutcome = { ok: true } | { ok: false; error: string }

/**
 * Runs the server action. `ok` confirms (the revalidated page brings the real state); a refusal or a
 * throw rolls back and carries a message to show (a throw must not reach the error boundary).
 */
export async function settleToggle(
  perform: () => Promise<{ ok: true } | { ok: false; error: string }>,
): Promise<ToggleOutcome> {
  try {
    const r = await perform()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  } catch {
    return { ok: false, error: TOGGLE_FAILED }
  }
}

/** The optimistic value while one is pending; otherwise what the server last confirmed. */
export const displayDone = (confirmed: boolean, optimistic: boolean | null): boolean => optimistic ?? confirmed

/** One step flipped; its time is a placeholder until the server's arrives. */
export function applyItemChange(items: TodayItem[], change: { id: string; checked: boolean }): TodayItem[] {
  return items.map((i) => (i.id === change.id ? { ...i, checked: change.checked, time: change.checked ? '…' : null } : i))
}

export const checkedCount = (items: TodayItem[]): number => items.filter((i) => i.checked).length
