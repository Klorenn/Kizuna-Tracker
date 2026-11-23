// Pomodoro, timer and stopwatch as one pure reducer. Everything derives from stored instants: the screen only
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

/** The three ways to measure: Pomodoro rounds, a countdown of chosen minutes, a count-up stopwatch. */
export type TimerMode = 'pomodoro' | 'timer' | 'stopwatch'
const MODES: readonly TimerMode[] = ['pomodoro', 'timer', 'stopwatch']

export const TIMER_CHIPS = [15, 25, 45, 60] as const
/** A stopwatch closes a block every time this many minutes of running time accumulate. */
export const STOPWATCH_BLOCK_MIN = 90
/** A stopwatch ends by itself after this much running time (pauses never count). */
export const STOPWATCH_CAP_MIN = 240
const STOPWATCH_SLOTS = 3

export function validatePomodoroConfig(c: PomodoroConfig, mode: TimerMode = 'pomodoro'): Result {
  if (mode === 'stopwatch') return { ok: true }
  if (mode === 'timer') {
    if (!Number.isInteger(c.focusMin) || c.focusMin < 1 || c.focusMin > 90) {
      return { ok: false, error: 'Elige entre 1 y 90 minutos.' }
    }
    return { ok: true }
  }
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

/** Why a session ended by itself: the stopwatch reached its cap. */
export type EndReason = 'cap'

/** A block this session closed and what the server said about it (so "Sumamos" is decided by block id). */
export type SessionBlock = { blockId: string; minutes: number; status: 'pending' | 'confirmed' | 'dropped' }

export type PomodoroState = {
  v: 1
  habitId: string
  mode: TimerMode
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
  /** Stopwatch only: the three block ids made when it starts (90 + 90 + 60 at most), reused on every retry. */
  blockIds: string[]
  /** Stopwatch only: how many blocks it already closed (they are in `pending` until the server answers). */
  chunks: number
  endReason: EndReason | null
  /** The last finish had less than one whole minute: nothing was queued and the screen says so. */
  tooShort: boolean
  /** The blocks of the current session only; blocks left over from an earlier one are not in it. */
  sessionBlocks: SessionBlock[]
}

export type PomodoroEvent =
  // pomodoro and timer use `blockId`; the stopwatch uses `blockIds` (the screen may send both: the mode decides)
  | { type: 'start'; at: number; blockId: string; blockIds?: [string, string, string] }
  | { type: 'start'; at: number; blockIds: [string, string, string]; blockId?: string }
  | { type: 'pause'; at: number }
  | { type: 'resume'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'finish'; at: number }
  | { type: 'skip'; at: number; blockId: string }
  | { type: 'confirm'; blockId: string }
  | { type: 'drop'; blockId: string }
  | { type: 'reset' }

export function initialPomodoro(habitId: string, config: PomodoroConfig, mode: TimerMode = 'pomodoro'): PomodoroState {
  return {
    v: 1,
    habitId,
    mode,
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
    blockIds: [],
    chunks: 0,
    endReason: null,
    tooShort: false,
    sessionBlocks: [],
  }
}

const phaseMs = (s: PomodoroState): number =>
  s.phase === 'focus'
    ? s.mode === 'stopwatch'
      ? STOPWATCH_CAP_MIN * MIN_MS
      : s.config.focusMin * MIN_MS
    : s.phase === 'break'
      ? s.config.breakMin * MIN_MS
      : 0

/** Elapsed time of the running phase, bounded to [0, duration]. */
function elapsedAt(s: PomodoroState, now: number): number {
  if ((s.phase !== 'focus' && s.phase !== 'break') || s.phaseStartedAt === null) return 0
  const raw = (s.pausedAt ?? now) - s.phaseStartedAt - s.pausedMs
  return Math.min(Math.max(raw, 0), phaseMs(s))
}

const isLastCycle = (s: PomodoroState): boolean =>
  s.mode !== 'pomodoro' || (s.config.cycles !== null && s.cycle >= s.config.cycles)

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

function startFocus(s: PomodoroState, at: number, blockId: string | null, cycle: number): PomodoroState {
  return bump(s, {
    phase: 'focus',
    cycle,
    blockId,
    blockIds: [],
    chunks: 0,
    endReason: null,
    tooShort: false,
    phaseStartedAt: at,
    pausedAt: null,
    pausedMs: 0,
    lastTickAt: at,
  })
}

/**
 * Stopwatch: closes every 90-minute block of running time that already passed by `at` (each at the
 * instant its 90th minute completed) and ends the session at the 4-hour cap. Pauses move the
 * boundaries, so this must run before any pause starts (the reducer does).
 */
function settleStopwatch(s: PomodoroState, at: number): PomodoroState {
  if (s.mode !== 'stopwatch' || s.phase !== 'focus' || s.pausedAt !== null || s.phaseStartedAt === null) return s
  const runStart = s.phaseStartedAt + s.pausedMs
  const block = STOPWATCH_BLOCK_MIN * MIN_MS
  let cur = s
  while (cur.chunks < STOPWATCH_SLOTS - 1 && at >= runStart + (cur.chunks + 1) * block) {
    cur = addChunk(cur, STOPWATCH_BLOCK_MIN, runStart + (cur.chunks + 1) * block)
  }
  if (at >= runStart + STOPWATCH_CAP_MIN * MIN_MS) {
    const end = runStart + STOPWATCH_CAP_MIN * MIN_MS
    cur = addChunk(cur, STOPWATCH_CAP_MIN - cur.chunks * STOPWATCH_BLOCK_MIN, end)
    cur = { ...cur, phase: 'done', endReason: 'cap', blockIds: [], phaseStartedAt: end, pausedAt: null, pausedMs: 0, lastTickAt: at }
  }
  return cur
}

function addChunk(s: PomodoroState, minutes: number, endedAt: number): PomodoroState {
  const id = s.blockIds[s.chunks]
  const pending = id !== undefined ? [...s.pending, { blockId: id, minutes, endedAt }] : s.pending
  return { ...s, pending, chunks: s.chunks + 1, rev: s.rev + 1 }
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
    if (cur.mode === 'stopwatch') {
      cur = settleStopwatch(cur, at)
      break
    }
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

/** Back to idle without a block: under one whole minute never counts. */
function tooShortReset(s: PomodoroState): PomodoroState {
  return { ...initialPomodoro(s.habitId, s.config, s.mode), pending: s.pending, tooShort: true, rev: s.rev + 1 }
}

function finishStopwatch(s: PomodoroState, at: number): PomodoroState {
  const cur = settleStopwatch(s, at)
  if (cur.phase !== 'focus') return cur // the cap already ended it
  const minutes = Math.floor(elapsedAt(cur, at) / MIN_MS) - cur.chunks * STOPWATCH_BLOCK_MIN
  if (minutes < 1 && cur.chunks === 0) return tooShortReset(cur)
  const closed = minutes >= 1 ? addChunk(cur, minutes, at) : cur
  return bump(closed, { phase: 'done', blockIds: [], phaseStartedAt: at, pausedAt: null, pausedMs: 0, lastTickAt: at })
}

/** Keeps `sessionBlocks` in step with `pending`: new blocks join it, an answer settles its block. */
export function pomodoroReducer(s: PomodoroState, e: PomodoroEvent): PomodoroState {
  const next = reduce(s, e)
  if (next === s) return s
  let blocks = next.sessionBlocks
  if (e.type === 'start' && (s.phase === 'idle' || s.phase === 'done') && next.phase === 'focus') blocks = []
  const known = new Set(s.pending.map((p) => p.blockId))
  const fresh = next.pending.filter((p) => !known.has(p.blockId))
  if (fresh.length > 0) {
    blocks = [...blocks, ...fresh.map((p) => ({ blockId: p.blockId, minutes: p.minutes, status: 'pending' as const }))]
  }
  if ((e.type === 'confirm' || e.type === 'drop') && blocks.some((b) => b.blockId === e.blockId)) {
    const status = e.type === 'confirm' ? ('confirmed' as const) : ('dropped' as const)
    blocks = blocks.map((b) => (b.blockId === e.blockId ? { ...b, status } : b))
  }
  return blocks === next.sessionBlocks ? next : { ...next, sessionBlocks: blocks }
}

/**
 * What the server has said about the blocks of this session only (matched by block id): `pending`
 * while any waits, `confirmed` when every one was accepted, `partial` when some were refused.
 */
export function sessionSummary(s: PomodoroState): {
  status: 'none' | 'pending' | 'confirmed' | 'partial'
  pendingMin: number
  confirmedMin: number
} {
  const sum = (st: SessionBlock['status']) =>
    s.sessionBlocks.filter((b) => b.status === st).reduce((n, b) => n + b.minutes, 0)
  const has = (st: SessionBlock['status']) => s.sessionBlocks.some((b) => b.status === st)
  const status = has('pending')
    ? 'pending'
    : has('confirmed')
      ? has('dropped')
        ? 'partial'
        : 'confirmed'
      : 'none'
  return { status, pendingMin: sum('pending'), confirmedMin: sum('confirmed') }
}

function reduce(s: PomodoroState, e: PomodoroEvent): PomodoroState {
  switch (e.type) {
    case 'start': {
      if (s.phase !== 'idle' && s.phase !== 'done' && s.phase !== 'ready') return s
      if (s.mode === 'stopwatch') {
        if (e.blockIds === undefined || e.blockIds.length !== STOPWATCH_SLOTS || s.phase === 'ready') return s
        return { ...startFocus(s, e.at, null, 1), blockIds: [...e.blockIds], credited: 0 }
      }
      if (e.blockId === undefined) return s
      if (s.phase === 'ready') return startFocus(s, e.at, e.blockId, s.cycle + 1)
      return { ...startFocus(s, e.at, e.blockId, 1), credited: 0 }
    }
    case 'pause': {
      // timer and stopwatch settle what already expired first: a pause moves their boundaries
      const base = s.mode === 'pomodoro' ? s : tick(s, e.at)
      if ((base.phase !== 'focus' && base.phase !== 'break') || base.pausedAt !== null) return base
      return bump(base, { pausedAt: e.at, lastTickAt: e.at })
    }
    case 'resume': {
      if (s.pausedAt === null) return s
      return bump(s, { pausedAt: null, pausedMs: s.pausedMs + Math.max(0, e.at - s.pausedAt), lastTickAt: e.at })
    }
    case 'tick':
      return tick(s, e.at)
    case 'finish': {
      if (s.phase === 'focus' && s.mode === 'stopwatch') return finishStopwatch(s, e.at)
      if (s.phase === 'focus' && s.mode === 'timer') {
        const elapsed = elapsedAt(s, e.at)
        const endedAt = elapsed >= phaseMs(s) && s.phaseStartedAt !== null ? s.phaseStartedAt + s.pausedMs + phaseMs(s) : e.at
        const minutes = Math.floor(elapsed / MIN_MS)
        if (minutes < 1) return tooShortReset(s)
        const pending = s.blockId !== null ? [...s.pending, { blockId: s.blockId, minutes, endedAt }] : s.pending
        return bump(s, { phase: 'done', pending, blockId: null, phaseStartedAt: e.at, pausedAt: null, pausedMs: 0, lastTickAt: e.at })
      }
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
      if (s.mode !== 'pomodoro') return s
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
        ...initialPomodoro(s.habitId, s.config, s.mode),
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
  /** What the big readout shows: time left (pomodoro, timer) or time elapsed (stopwatch). */
  displayMs: number
  direction: 'down' | 'up'
} {
  const elapsedMs = elapsedAt(s, now)
  const up = s.mode === 'stopwatch'
  const duration = s.phase === 'idle' ? s.config.focusMin * MIN_MS : phaseMs(s)
  const remainingMs = s.phase === 'idle' ? duration : duration - elapsedMs
  return {
    displayMs: up ? elapsedMs : remainingMs,
    direction: up ? 'up' : 'down',
    phase: s.phase,
    remainingMs,
    elapsedMs,
    cycle: s.cycle,
    cyclesTotal: s.config.cycles,
    paused: s.pausedAt !== null,
  }
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** The big readout: a countdown rounds up ("25:00"), a stopwatch rounds down and shows hours past 59:59 ("1:05:09"). */
export function formatReadout(ms: number, direction: 'down' | 'up'): string {
  if (!Number.isFinite(ms)) return '00:00'
  const total = Math.max(0, direction === 'down' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  if (direction === 'up' && h > 0) return `${h}:${pad2(m)}:${pad2(sec)}`
  return `${pad2(Math.floor(total / 60))}:${pad2(sec)}`
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
  // states stored before the timer and the stopwatch existed have no mode: they are pomodoros
  const mode = d.mode === undefined ? 'pomodoro' : d.mode
  if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) return null
  const config: PomodoroConfig = { focusMin: c.focusMin as number, breakMin: c.breakMin as number, cycles: c.cycles as number | null }
  if (!isNum(config.focusMin) || !isNum(config.breakMin) || !isNumOrNull(config.cycles)) return null
  if (!validatePomodoroConfig(config, mode as TimerMode).ok) return null
  const blockIds = d.blockIds === undefined ? [] : d.blockIds
  if (!Array.isArray(blockIds) || blockIds.length > STOPWATCH_SLOTS || !blockIds.every((x) => typeof x === 'string')) return null
  const chunks = d.chunks === undefined ? 0 : d.chunks
  if (typeof chunks !== 'number' || !Number.isInteger(chunks) || chunks < 0 || chunks > STOPWATCH_SLOTS) return null
  const endReason = d.endReason === undefined ? null : d.endReason
  if (endReason !== null && endReason !== 'cap') return null
  const tooShort = d.tooShort === undefined ? false : d.tooShort
  if (typeof tooShort !== 'boolean') return null
  const rawBlocks = d.sessionBlocks === undefined ? [] : d.sessionBlocks
  if (!Array.isArray(rawBlocks)) return null
  const sessionBlocks: SessionBlock[] = []
  for (const b of rawBlocks as unknown[]) {
    const x = b as Record<string, unknown> | null
    if (typeof x !== 'object' || x === null || typeof x.blockId !== 'string' || !isNum(x.minutes)) return null
    if (x.status !== 'pending' && x.status !== 'confirmed' && x.status !== 'dropped') return null
    sessionBlocks.push({ blockId: x.blockId, minutes: x.minutes, status: x.status })
  }
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
  if (phase === 'focus' && mode !== 'stopwatch' && d.blockId === null) return null
  if (phase === 'focus' && mode === 'stopwatch' && blockIds.length !== STOPWATCH_SLOTS) return null
  return {
    v: 1,
    habitId: d.habitId,
    mode: mode as TimerMode,
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
    blockIds: blockIds as string[],
    chunks,
    endReason: endReason as EndReason | null,
    tooShort,
    sessionBlocks,
  }
}
