import type { addQuantity } from "@/app/(app)/registros/quantity-actions";
import { localDate } from "@/domain/dates";
import { parseAmount, type QuantityConfig } from "@/domain/quantity";

/**
 * Offline-tolerant queue for quantity taps: one tap = one sum, even if the network fails.
 *
 * - One queue per browser tab, shared by every control (`sharedQuantityQueue`). The persisted list
 *   (sessionStorage, one key) is the source of truth: it is re-read before every change, so two
 *   queues over the same storage never erase each other's taps.
 * - Each sum has its own entry id, kept across retries (the RPC is idempotent by id). An id is in
 *   flight at most once at a time; sending twice is harmless, losing a tap is not.
 * - A network failure keeps the tap and retries with capped exponential backoff (1 s, 2 s, 4 s ...
 *   30 s), and again on add, `online` and `visibilitychange`. A refusal by the server drops the tap
 *   and leaves a notice for its habit.
 */

export const QUANTITY_QUEUE_KEY = "kizuna:quantity-queue";
export const BACKOFF_FIRST_MS = 1000;
export const BACKOFF_MAX_MS = 30000;

/** Copy shared by the actions and the controls. */
export const QUANTITY_MESSAGES = {
  offlineAdd: "Sin conexión. Guardaremos la suma cuando vuelvas a estar en línea.",
  offlineRemove: "Sin conexión. No pudimos quitar la suma.",
  /** A tap from an earlier local day is never credited to a later one (same rule as Pomodoro blocks). */
  staleDay: "Una suma de ayer no se guardó.",
  notFound: "No encontramos esa suma.",
} as const;

/**
 * `day` is the local date (in `zone`, the profile time zone) on which the tap happened; sums stored
 * before it was recorded have neither and are always sent.
 */
export type PendingSum = { entryId: string; habitId: string; amount: number; day?: string; zone?: string };
type Send = typeof addQuantity;
type SendResult = Awaited<ReturnType<Send>>;

export type QueueEvent =
  /** The server answered: accepted or refused (the tap left the queue). */
  | { kind: "settled"; sum: PendingSum; result: SendResult }
  /** No answer from the server: the tap stays pending and will be retried. */
  | { kind: "offline"; sum: PendingSum; error: string }
  /** The last pending tap was answered. */
  | { kind: "drained" };

/**
 * The connectivity line of one habit's control after a queue event: shown by an offline event of
 * that habit, cleared by any answer from the server for it (accepted or refused) and when the queue
 * drains, left alone by events of other habits.
 */
export function offlineAfter(current: string | null, e: QueueEvent, habitId: string): string | null {
  if (e.kind === "drained") return null;
  if (e.sum.habitId !== habitId) return current;
  return e.kind === "offline" ? e.error : null;
}

export type QuantityNotice = { habitId: string; entryId: string; error: string };

export type QuantityQueue = {
  /**
   * Records the tap (with its local day in `timeZone`), sends it (and any backlog), and returns the
   * optimistic total for the habit. A tap still pending on a later local day is dropped, never sent.
   */
  add(habitId: string, amount: number, timeZone?: string): { entryId: string; optimisticTotal: number };
  /** Waits for sends in flight, then resends whatever is still pending. */
  flush(): Promise<void>;
  pending(): PendingSum[];
  /** Last total confirmed by the server (or set by the screen) for a habit. */
  total(habitId: string): number;
  /** Confirmed total plus pending sums: the running number the screen shows. */
  optimisticTotal(habitId: string): number;
  /**
   * Aligns the confirmed total with the screen's data. `appliedIds` are entries the server already
   * has (they are in that total): pending taps with those ids are dropped instead of counted twice.
   */
  setTotal(habitId: string, total: number, appliedIds?: readonly string[]): void;
  subscribe(listener: (e: QueueEvent) => void): () => void;
  /** Refusals nobody has shown yet for a habit (e.g. its control was not mounted). */
  takeNotices(habitId: string): QuantityNotice[];
};

type Options = {
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** The clock, for tests (default `Date.now`). */
  now?: () => number;
  /** Called after the server answers a send (accepted or refused), never for network failures. */
  onSettled?: (sum: PendingSum, result: SendResult) => void;
};

function defaultStorage(): Options["storage"] {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isSum(x: unknown): x is PendingSum {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  return typeof s.entryId === "string" && typeof s.habitId === "string" && typeof s.amount === "number" && s.amount > 0;
}

/** True when the tap's local day is over (its zone's date is now later). Unknown day or zone: not stale. */
function isStale(sum: PendingSum, now: number): boolean {
  if (!sum.day || !sum.zone) return false;
  try {
    return localDate(new Date(now), sum.zone) > sum.day;
  } catch {
    return false;
  }
}

/** The line to show for refusals nobody has seen: "Una suma de ayer…" in singular or plural, else the last one. */
export function refusalText(refused: readonly { error: string }[]): string {
  const allStale = refused.length > 0 && refused.every((n) => n.error === QUANTITY_MESSAGES.staleDay);
  if (allStale && refused.length > 1) return `${refused.length} sumas de ayer no se guardaron.`;
  return refused[refused.length - 1].error;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Delay before retry number `attempt` (1-based): 1 s, 2 s, 4 s ... capped at 30 s. */
export const backoffDelay = (attempt: number) => Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** Math.max(0, attempt - 1));

export function createQuantityQueue(send: Send, idFactory: () => string, options: Options = {}): QuantityQueue {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? Date.now;
  const totals = new Map<string, number>();
  const inflight = new Map<string, Promise<void>>();
  const listeners = new Set<(e: QueueEvent) => void>();
  let notices: QuantityNotice[] = [];
  let mem: PendingSum[] = [];
  let storageBroken = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Storage is the source of truth: always re-read, so other queues' taps are never erased.
  function read(): PendingSum[] {
    if (!storage || storageBroken) return mem;
    try {
      const parsed: unknown = JSON.parse(storage.getItem(QUANTITY_QUEUE_KEY) ?? "[]");
      return Array.isArray(parsed)
        ? parsed.filter(isSum).map((s) => ({
            entryId: s.entryId,
            habitId: s.habitId,
            amount: s.amount,
            ...(typeof s.day === "string" && typeof s.zone === "string" ? { day: s.day, zone: s.zone } : {}),
          }))
        : [];
    } catch {
      return [];
    }
  }
  function write(list: PendingSum[]) {
    mem = list;
    if (!storage) return;
    try {
      storage.setItem(QUANTITY_QUEUE_KEY, JSON.stringify(list));
    } catch {
      storageBroken = true; // full or blocked: the queue keeps working in memory
    }
  }

  const emit = (e: QueueEvent) => {
    for (const l of [...listeners]) l(e);
  };

  const optimisticTotal = (habitId: string) =>
    round2((totals.get(habitId) ?? 0) + read().filter((s) => s.habitId === habitId).reduce((a, s) => a + s.amount, 0));

  function scheduleRetry() {
    if (timer) return;
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, backoffDelay(attempt));
  }

  function dispatch(sum: PendingSum): Promise<void> {
    const existing = inflight.get(sum.entryId);
    if (existing) return existing;
    const run = (async () => {
      let result: SendResult;
      if (isStale(sum, now())) {
        // the day of the tap is over: it is not credited to today (refused for good, with a notice)
        result = { ok: false, error: QUANTITY_MESSAGES.staleDay, retry: false };
      } else {
        try {
          result = await send(sum.habitId, sum.entryId, sum.amount);
        } catch {
          result = { ok: false, error: QUANTITY_MESSAGES.offlineAdd, retry: true };
        }
      }
      if (!result.ok && result.retry) {
        emit({ kind: "offline", sum, error: result.error });
        scheduleRetry();
        return;
      }
      const rest = read().filter((s) => s.entryId !== sum.entryId);
      write(rest);
      attempt = 0;
      if (result.ok) totals.set(sum.habitId, result.total);
      else notices = [...notices, { habitId: sum.habitId, entryId: sum.entryId, error: result.error }];
      if (rest.length === 0 && timer) {
        clearTimeout(timer);
        timer = null;
      }
      options.onSettled?.(sum, result);
      emit({ kind: "settled", sum, result });
      if (rest.length === 0) emit({ kind: "drained" });
    })().finally(() => inflight.delete(sum.entryId));
    inflight.set(sum.entryId, run);
    return run;
  }

  async function flush() {
    await Promise.all([...inflight.values()]);
    await Promise.all(read().filter((s) => !inflight.has(s.entryId)).map(dispatch));
  }

  return {
    add(habitId, amount, timeZone) {
      let day: string | undefined;
      if (timeZone) {
        try {
          day = localDate(new Date(now()), timeZone);
        } catch {
          day = undefined;
        }
      }
      const sum: PendingSum = { entryId: idFactory(), habitId, amount, ...(day && timeZone ? { day, zone: timeZone } : {}) };
      write([...read(), sum]);
      const optimistic = optimisticTotal(habitId);
      void dispatch(sum);
      for (const other of read()) if (other.entryId !== sum.entryId && !inflight.has(other.entryId)) void dispatch(other);
      return { entryId: sum.entryId, optimisticTotal: optimistic };
    },
    flush,
    pending: () => read(),
    total: (habitId) => totals.get(habitId) ?? 0,
    optimisticTotal,
    setTotal(habitId, total, appliedIds = []) {
      if (appliedIds.length > 0) {
        const applied = new Set(appliedIds);
        const list = read();
        const rest = list.filter((s) => !applied.has(s.entryId));
        if (rest.length !== list.length) write(rest);
      }
      totals.set(habitId, total);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    takeNotices(habitId) {
      const mine = notices.filter((n) => n.habitId === habitId);
      notices = notices.filter((n) => n.habitId !== habitId);
      return mine;
    },
  };
}

type Target = { addEventListener(type: string, fn: () => void): void; removeEventListener(type: string, fn: () => void): void };

/** Flush on `online` and when the page becomes visible again. Returns the cleanup. */
export function attachQuantityQueueTriggers(
  queue: Pick<QuantityQueue, "flush">,
  win: Target,
  doc: Target & { visibilityState: string },
): () => void {
  const onOnline = () => void queue.flush();
  const onVisible = () => {
    if (doc.visibilityState === "visible") void queue.flush();
  };
  win.addEventListener("online", onOnline);
  doc.addEventListener("visibilitychange", onVisible);
  return () => {
    win.removeEventListener("online", onOnline);
    doc.removeEventListener("visibilitychange", onVisible);
  };
}

let shared: QuantityQueue | null = null;

/** The tab's one queue (created on first use; in the browser it also wires its triggers and resends the backlog). */
export function sharedQuantityQueue(send: Send, idFactory: () => string = newEntryId): QuantityQueue {
  if (!shared) {
    shared = createQuantityQueue(send, idFactory);
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      attachQuantityQueueTriggers(shared, window, document);
      void shared.flush();
    }
  }
  return shared;
}

/** Test helper: forget the shared queue. */
export function resetSharedQuantityQueue() {
  shared = null;
}

/** A UUID v4 for a tap: `crypto.randomUUID` is missing on insecure origins (LAN http) and old WebViews. */
export function newEntryId(): string {
  const c = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Goal met = the server's confirmed total reached the goal (or the server says the day is done); never the optimistic number. */
export const goalMet = (confirmedTotal: number, target: number, serverDone = false): boolean =>
  serverDone || (target > 0 && confirmedTotal >= target);

const allowsDecimals = (c: QuantityConfig) => c.unit === "km" || c.unit === "custom" || c.display === "glasses";

export const TYPED_AMOUNT_COPY = {
  invalid: "Revisa la cantidad.",
  whole: "Usa números enteros, por ejemplo 1250.",
  ambiguous: "¿Mil o decimal? Escribe 1250 o 1,25.",
} as const;

export type TypedAmount = { ok: true; amount: number } | { ok: false; error: string };

const THOUSANDS = /^[1-9]\d{0,2}(\.\d{3})+$/;

/**
 * What the user typed, in base units, with es-CL conventions. A number never silently changes by a
 * factor of 1000:
 * - A comma is the decimal separator. Dots before it are thousands and must form groups of three
 *   ("1.250,5" = 1250,5; "12.50,5" is refused). Extra decimal zeros are dropped ("1,250" = 1,25).
 * - Whole-number units (ml, steps, times, minutes): digits with valid thousands dots ("1.250" = 1250);
 *   any fractional part is refused ("1.5", "1,250").
 * - Decimal units (km, custom, glasses): one dot and one or two digits is a decimal point ("1.5");
 *   one dot and exactly three digits is ambiguous and refused ("10.000"); several dots are refused.
 */
export function parseTypedAmountResult(raw: string, c: QuantityConfig): TypedAmount {
  const invalid: TypedAmount = { ok: false, error: TYPED_AMOUNT_COPY.invalid };
  const s = raw.trim();
  if (!/^[\d.,]+$/.test(s)) return invalid;
  const decimals = allowsDecimals(c);
  let normalized: string;

  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length !== 2) return invalid;
    const [intRaw, fracRaw] = parts;
    if (!/^\d+$/.test(intRaw) && !THOUSANDS.test(intRaw)) return invalid;
    if (!/^\d+$/.test(fracRaw)) return invalid;
    if (!decimals) return { ok: false, error: TYPED_AMOUNT_COPY.whole };
    const frac = fracRaw.replace(/0+$/, "");
    if (frac.length > 2) return invalid;
    normalized = `${intRaw.replace(/\./g, "")}${frac ? `.${frac}` : ""}`;
  } else if (!s.includes(".")) {
    normalized = s;
  } else if (!decimals) {
    if (THOUSANDS.test(s)) normalized = s.replace(/\./g, "");
    else if (/^\d+\.\d+$/.test(s)) return { ok: false, error: TYPED_AMOUNT_COPY.whole };
    else return invalid;
  } else {
    const m = /^(\d+)\.(\d+)$/.exec(s);
    if (!m) return invalid;
    if (m[2].length === 3) return { ok: false, error: TYPED_AMOUNT_COPY.ambiguous };
    if (m[2].length > 3) return invalid;
    normalized = s;
  }

  const amount = parseAmount(normalized, c);
  return amount === null ? invalid : { ok: true, amount };
}

/** The number-or-null view of `parseTypedAmountResult`. */
export function parseTypedAmount(raw: string, c: QuantityConfig): number | null {
  const r = parseTypedAmountResult(raw, c);
  return r.ok ? r.amount : null;
}

/** The server's "done" flag only outlives a refresh while the confirmed total still reaches the goal. */
export const doneAfterSync = (serverDone: boolean, confirmedTotal: number, target: number): boolean =>
  confirmedTotal >= target ? serverDone : false;

/**
 * The goal a draft carries for what was typed. NaN (refused by validateQuantityConfig) when it does
 * not parse, or when `lockedMin` is set and the goal is below it: the typed text stays visible and
 * the form cannot save a lowered goal.
 */
export function resolveTarget(raw: string, c: QuantityConfig, lockedMin: number | null): number {
  const n = parseTypedAmount(raw, c);
  if (n === null) return NaN;
  if (lockedMin !== null && n < lockedMin) return NaN;
  return n;
}
