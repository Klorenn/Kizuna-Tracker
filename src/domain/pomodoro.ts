// Pomodoro timer as a pure reducer. Everything derives from stored instants: the screen only
// redraws, and `tick` (every second and when the page comes back) settles whatever expired.
// Time is always passed in (`at`, `now`); nothing here reads a clock.

type Result = { ok: true } | { ok: false; error: string }

const MIN_MS = 60_000
/** How far a tick may lag before `lastTickAt` is rewritten (a backwards clock jump smaller than this goes unnoticed). */
const TICK_PERSIST_MS = 15_000

export type PomodoroConfig = { focusMin: number; breakMin: number; cycles: number | null }

export const POMODORO_PRESETS = [
  { key: '25-5', focusMin: 25, breakMin: 5 },
  { key: '50-10', focusMin: 50, breakMin: 10 },
] as const

export function validatePomodoroConfig(c: PomodoroConfig): Result {
  if (!Number.isInteger(c.focusMin) || c.focusMin < 5 || c.focusMin > 90) {
    return { ok: false, error: 'El foco va de 5 a 90 minutos.' }
  }
  if (!Number.isInteger(c.breakMin) || c.breakMin < 1 || c.breakMin > 30) {
    return { ok: false, error: 'El descanso va de 1 a 30 minutos.' }
  }
  if (c.cycles !== null && (!Number.isInteger(c.cycles) || c.cycles < 1 || c.cycles > 12)) {
    return { ok: false, error: 'Las rondas van de 1 a 12.' }
  }
  return { ok: true }
}

export type PomodoroPhase = 'idle' | 'focus' | 'break' | 'ready' | 'done'
const PHASES: readonly PomodoroPhase[] = ['idle', 'focus', 'break', 'ready', 'done']

/** A finished focus block waiting to reach the server (idempotent by `blockId`). */
export type PendingBlock = { blockId: string; minutes: number; endedAt: number }

export type PomodoroState = {
  v: 1
  habitId: string
  config: PomodoroConfig
  phase: PomodoroPhase
  /** Current round, 1-based; 0 while idle. */
  cycle: number
  blockId: string | null
  phaseStartedAt: number | null
  pausedAt: number | null
  pausedMs: number
  lastTickAt: number | null
  pending: PendingBlock[]
  credited: number
  rev: number
}

export type PomodoroEvent =
  | { type: 'start'; at: number; blockId: string }
  | { type: 'pause'; at: number }
  | { type: 'resume'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'finish'; at: number }
  | { type: 'skip'; at: number; blockId: string }
  | { type: 'confirm'; blockId: string }
  | { type: 'drop'; blockId: string }
  | { type: 'reset' }

export function initialPomodoro(habitId: string, config: PomodoroConfig): PomodoroState {
  return {
    v: 1,
    habitId,
    config: { ...config },
    phase: 'idle',
    cycle: 0,
    blockId: null,
    phaseStartedAt: null,
    pausedAt: null,
    pausedMs: 0,
    lastTickAt: null,
    pending: [],
    credited: 0,
    rev: 0,
  }
}

const phaseMs = (s: PomodoroState): number =>
  s.phase === 'focus' ? s.config.focusMin * MIN_MS : s.phase === 'break' ? s.config.breakMin * MIN_MS : 0

/** Elapsed time of the running phase, bounded to [0, duration]. */
function elapsedAt(s: PomodoroState, now: number): number {
  if ((s.phase !== 'focus' && s.phase !== 'break') || s.phaseStartedAt === null) return 0
  const raw = (s.pausedAt ?? now) - s.phaseStartedAt - s.pausedMs
  return Math.min(Math.max(raw, 0), phaseMs(s))
}

const isLastCycle = (s: PomodoroState): boolean => s.config.cycles !== null && s.cycle >= s.config.cycles

const bump = (s: PomodoroState, patch: Partial<PomodoroState>): PomodoroState => ({ ...s, ...patch, rev: s.rev + 1 })

/** Closes the focus phase at `endedAt` with `minutes` (a block only when there is at least one). */
function closeFocus(s: PomodoroState, minutes: number, endedAt: number): PomodoroState {
  const pending =
    minutes >= 1 && s.blockId !== null ? [...s.pending, { blockId: s.blockId, minutes, endedAt }] : s.pending
  const next: Partial<PomodoroState> = isLastCycle(s)
    ? { phase: 'done' }
    : { phase: 'break' }
  return bump(s, {
    ...next,
    pending,
    blockId: null,
    phaseStartedAt: endedAt,
    pausedAt: null,
    pausedMs: 0,
  })
}

function startFocus(s: PomodoroState, at: number, blockId: string, cycle: number): PomodoroState {
  return bump(s, {
    phase: 'focus',
    cycle,
    blockId,
    phaseStartedAt: at,
    pausedAt: null,
    pausedMs: 0,
    lastTickAt: at,
  })
}

function tick(s: PomodoroState, at: number): PomodoroState {
  if (s.phase !== 'focus' && s.phase !== 'break') return s
  let cur = s
  // Device clock moved backwards: shift the phase start so elapsed time never retreats.
  if (cur.pausedAt === null && cur.lastTickAt !== null && at < cur.lastTickAt && cur.phaseStartedAt !== null) {
    cur = { ...cur, phaseStartedAt: cur.phaseStartedAt + (at - cur.lastTickAt) }
  }
  // `lastTickAt` only advances every TICK_PERSIST_MS (or when something else changes), so a
  // per-second tick that changes nothing returns the very same state and cannot re-render.
  if (cur.lastTickAt === null || at - cur.lastTickAt >= TICK_PERSIST_MS || cur !== s) {
    cur = { ...cur, lastTickAt: at }
  }
  // Catch up: a focus may expire, then its break; a break never starts another focus by itself.
  while (cur.pausedAt === null && cur.phaseStartedAt !== null) {
    if (cur.phase === 'focus') {
      const end = cur.phaseStartedAt + cur.pausedMs + cur.config.focusMin * MIN_MS
      if (at < end) break
      cur = closeFocus(cur, cur.config.focusMin, end)
      if (cur.phase === 'done') break
    } else if (cur.phase === 'break') {
      const end = cur.phaseStartedAt + cur.pausedMs + cur.config.breakMin * MIN_MS
      if (at < end) break
      cur = { ...cur, phase: 'ready', phaseStartedAt: end, pausedMs: 0 }
      break
    } else break
  }
  if (cur === s) return s
  // A phase change inside the catch-up loop pins lastTickAt to `at` so stored timestamps stay ordered.
  return { ...cur, lastTickAt: cur.phase !== s.phase ? at : cur.lastTickAt, rev: s.rev + 1 }
}

export function pomodoroReducer(s: PomodoroState, e: PomodoroEvent): PomodoroState {
  switch (e.type) {
    case 'start': {
      if (s.phase === 'idle' || s.phase === 'done') {
        return { ...startFocus(s, e.at, e.blockId, 1), credited: 0 }
      }
      if (s.phase === 'ready') return startFocus(s, e.at, e.blockId, s.cycle + 1)
      return s
    }
    case 'pause': {
      if ((s.phase !== 'focus' && s.phase !== 'break') || s.pausedAt !== null) return s
      return bump(s, { pausedAt: e.at, lastTickAt: e.at })
    }
    case 'resume': {
      if (s.pausedAt === null) return s
      return bump(s, { pausedAt: null, pausedMs: s.pausedMs + Math.max(0, e.at - s.pausedAt), lastTickAt: e.at })
    }
    case 'tick':
      return tick(s, e.at)
    case 'finish': {
      if (s.phase === 'focus') {
        const elapsed = elapsedAt(s, e.at)
        const endedAt = elapsed >= phaseMs(s) && s.phaseStartedAt !== null ? s.phaseStartedAt + s.pausedMs + phaseMs(s) : e.at
        const minutes = Math.floor(elapsed / MIN_MS)
        const pending =
          minutes >= 1 && s.blockId !== null ? [...s.pending, { blockId: s.blockId, minutes, endedAt }] : s.pending
        return bump(s, { phase: 'done', pending, blockId: null, phaseStartedAt: e.at, pausedAt: null, pausedMs: 0, lastTickAt: e.at })
      }
      if (s.phase === 'break' || s.phase === 'ready') {
        return bump(s, { phase: 'done', blockId: null, phaseStartedAt: e.at, pausedAt: null, pausedMs: 0, lastTickAt: e.at })
      }
      return s
    }
    case 'skip': {
      if (s.phase === 'focus') {
        const elapsed = elapsedAt(s, e.at)
        const minutes = Math.floor(elapsed / MIN_MS)
        return { ...closeFocus(s, minutes, e.at), lastTickAt: e.at }
      }
      if (s.phase === 'break') return startFocus(s, e.at, e.blockId, s.cycle + 1)
      return s
    }
    case 'confirm':
    case 'drop': {
      if (!s.pending.some((p) => p.blockId === e.blockId)) return s
      return bump(s, {
        pending: s.pending.filter((p) => p.blockId !== e.blockId),
        credited: e.type === 'confirm' ? s.credited + 1 : s.credited,
      })
    }
    case 'reset':
      // Back to idle, keeping blocks that have not reached the server yet.
      return {
        ...initialPomodoro(s.habitId, s.config),
        pending: s.pending,
        rev: s.rev + 1,
      }
  }
}

export function pomodoroView(
  s: PomodoroState,
  now: number,
): {
  phase: PomodoroPhase
  remainingMs: number
  elapsedMs: number
  cycle: number
  cyclesTotal: number | null
  paused: boolean
} {
  const elapsedMs = elapsedAt(s, now)
  const duration = s.phase === 'idle' ? s.config.focusMin * MIN_MS : phaseMs(s)
  return {
    phase: s.phase,
    remainingMs: s.phase === 'idle' ? duration : duration - elapsedMs,
    elapsedMs,
    cycle: s.cycle,
    cyclesTotal: s.config.cycles,
    paused: s.pausedAt !== null,
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v)

/** Reads a stored state; anything malformed or of an unknown version is discarded (null). */
export function parsePomodoroState(raw: string | null): PomodoroState | null {
  if (raw === null || raw === '') return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if (d.v !== 1 || typeof d.habitId !== 'string') return null
  const c = d.config as Record<string, unknown> | null
  if (typeof c !== 'object' || c === null) return null
  const config: PomodoroConfig = { focusMin: c.focusMin as number, breakMin: c.breakMin as number, cycles: c.cycles as number | null }
  if (!isNum(config.focusMin) || !isNum(config.breakMin) || !isNumOrNull(config.cycles)) return null
  if (!validatePomodoroConfig(config).ok) return null
  if (typeof d.phase !== 'string' || !(PHASES as readonly string[]).includes(d.phase)) return null
  if (!isNum(d.cycle) || !isNum(d.pausedMs) || !isNum(d.credited) || !isNum(d.rev)) return null
  if (!Number.isInteger(d.cycle) || d.cycle < 0 || d.cycle > 1000) return null
  if (!Number.isInteger(d.credited) || d.credited < 0 || !Number.isInteger(d.rev) || d.rev < 0) return null
  if (d.pausedMs < 0) return null
  if (!isNumOrNull(d.phaseStartedAt) || !isNumOrNull(d.pausedAt) || !isNumOrNull(d.lastTickAt)) return null
  if ((d.phaseStartedAt ?? 0) < 0 || (d.pausedAt ?? 0) < 0 || (d.lastTickAt ?? 0) < 0) return null
  if (d.pausedAt !== null && (d.phaseStartedAt === null || d.pausedAt < d.phaseStartedAt)) return null
  if (d.pausedAt !== null && d.phase !== 'focus' && d.phase !== 'break') return null
  if (d.blockId !== null && typeof d.blockId !== 'string') return null
  if (!Array.isArray(d.pending)) return null
  const pending: PendingBlock[] = []
  for (const p of d.pending as unknown[]) {
    const b = p as Record<string, unknown> | null
    if (typeof b !== 'object' || b === null) return null
    if (typeof b.blockId !== 'string' || !isNum(b.minutes) || !isNum(b.endedAt)) return null
    if (!Number.isInteger(b.minutes) || b.minutes < 1 || b.minutes > 90 || b.endedAt < 0) return null
    pending.push({ blockId: b.blockId, minutes: b.minutes, endedAt: b.endedAt })
  }
  const phase = d.phase as PomodoroPhase
  if ((phase === 'focus' || phase === 'break') && d.phaseStartedAt === null) return null
  if (phase === 'focus' && d.blockId === null) return null
  return {
    v: 1,
    habitId: d.habitId,
    config,
    phase,
    cycle: d.cycle,
    blockId: d.blockId as string | null,
    phaseStartedAt: d.phaseStartedAt as number | null,
    pausedAt: d.pausedAt as number | null,
    pausedMs: d.pausedMs,
    lastTickAt: d.lastTickAt as number | null,
    pending,
    credited: d.credited,
    rev: d.rev,
  }
}
