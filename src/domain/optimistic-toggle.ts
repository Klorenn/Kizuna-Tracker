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

/**
 * A confirmed flip, held after the transition ends. `useOptimistic` drops its value when the
 * transition does; if the refreshed props have not landed yet (or came from a stale router/prefetched
 * payload) the row would flip back to its old state until some later refresh. `from` is the state the
 * props had when the tap ran: while they still show it, `value` is shown; once they move, they win.
 */
export type Settled = { from: boolean; value: boolean } | null

export const settledDone = (confirmed: boolean, settled: Settled): boolean =>
  settled && settled.from === confirmed ? settled.value : confirmed

/** The props moved off `from`: the held value has done its job and can go. */
export const settledIsStale = (confirmed: boolean, settled: Settled): boolean =>
  settled !== null && settled.from !== confirmed

/** Only a confirmed action settles; a refusal reverts to what the props say. */
export const nextSettled = (from: boolean, value: boolean, outcome: ToggleOutcome): Settled =>
  outcome.ok ? { from, value } : null

export type SettledItems = Record<string, { from: boolean; value: boolean }>

/** The steps with every held flip applied while the props still show the old state. */
export function settledItems(items: TodayItem[], held: SettledItems): TodayItem[] {
  let changed = false
  const out = items.map((i) => {
    const s = held[i.id]
    if (!s || s.from !== i.checked) return i
    changed = true
    return applyItemChange([i], { id: i.id, checked: s.value })[0]
  })
  return changed ? out : items
}

/** Drops the held flips the props have moved past (same object when nothing changes). */
export function pruneSettledItems(items: TodayItem[], held: SettledItems): SettledItems {
  const next: SettledItems = {}
  for (const [id, s] of Object.entries(held)) {
    const i = items.find((x) => x.id === id)
    if (i && i.checked === s.from) next[id] = s
  }
  return Object.keys(next).length === Object.keys(held).length ? held : next
}
