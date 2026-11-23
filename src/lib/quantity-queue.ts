import type { addQuantity } from "@/app/(app)/registros/quantity-actions";

/**
 * Offline-tolerant queue for quantity taps: one tap = one sum, even if the network fails.
 * Each sum gets its own entry id; a retryable failure keeps it (same id, so the server never
 * double-counts) and `flush()` sends it again. Pending sums live in sessionStorage.
 */

export const QUANTITY_QUEUE_KEY = "kizuna:quantity-queue";

export type PendingSum = { entryId: string; habitId: string; amount: number };
type Send = typeof addQuantity;
type SendResult = Awaited<ReturnType<Send>>;

export type QuantityQueue = {
  /** Records the tap, sends it, and returns the optimistic total for the habit. */
  add(habitId: string, amount: number): { entryId: string; optimisticTotal: number };
  /** Waits for sends in flight, then resends whatever is still pending. */
  flush(): Promise<void>;
  pending(): PendingSum[];
  /** Last total confirmed by the server (or set by the screen) for a habit. */
  total(habitId: string): number;
  /** Total as the screen shows it: confirmed total plus pending sums. */
  optimisticTotal(habitId: string): number;
  /** Aligns the confirmed total with the screen's data (e.g. after a refresh or a removal). */
  setTotal(habitId: string, total: number): void;
};

type Options = {
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** Called after a send is answered by the server (accepted or refused), never for network failures. */
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
  return (
    typeof s.entryId === "string" && typeof s.habitId === "string" && typeof s.amount === "number" && s.amount > 0
  );
}

export function createQuantityQueue(send: Send, idFactory: () => string, options: Options = {}): QuantityQueue {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const totals = new Map<string, number>();
  const inflight = new Map<string, Promise<void>>();

  let items: PendingSum[] = [];
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(QUANTITY_QUEUE_KEY) ?? "[]");
    if (Array.isArray(parsed)) items = parsed.filter(isSum).map((s) => ({ entryId: s.entryId, habitId: s.habitId, amount: s.amount }));
  } catch {
    items = [];
  }

  const save = () => {
    try {
      storage?.setItem(QUANTITY_QUEUE_KEY, JSON.stringify(items));
    } catch {
      /* storage full or blocked: the queue still works in memory */
    }
  };

  const optimisticTotal = (habitId: string) =>
    Math.round(
      ((totals.get(habitId) ?? 0) + items.filter((s) => s.habitId === habitId).reduce((a, s) => a + s.amount, 0)) * 100,
    ) / 100;

  function dispatch(sum: PendingSum): Promise<void> {
    const existing = inflight.get(sum.entryId);
    if (existing) return existing;
    const run = (async () => {
      let result: SendResult;
      try {
        result = await send(sum.habitId, sum.entryId, sum.amount);
      } catch {
        return; // thrown = no answer from the server: keep it pending
      }
      if (!result.ok && result.retry) return;
      items = items.filter((s) => s.entryId !== sum.entryId);
      save();
      if (result.ok) totals.set(sum.habitId, result.total);
      options.onSettled?.(sum, result);
    })().finally(() => inflight.delete(sum.entryId));
    inflight.set(sum.entryId, run);
    return run;
  }

  return {
    add(habitId, amount) {
      const sum = { entryId: idFactory(), habitId, amount };
      items = [...items, sum];
      save();
      const optimistic = optimisticTotal(habitId);
      void dispatch(sum);
      return { entryId: sum.entryId, optimisticTotal: optimistic };
    },
    async flush() {
      await Promise.all([...inflight.values()]);
      await Promise.all(items.filter((s) => !inflight.has(s.entryId)).map(dispatch));
    },
    pending: () => items.map((s) => ({ ...s })),
    total: (habitId) => totals.get(habitId) ?? 0,
    optimisticTotal,
    setTotal(habitId, total) {
      totals.set(habitId, total);
    },
  };
}
