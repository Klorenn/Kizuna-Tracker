import type { KeyValueStorage } from "@/lib/pomodoro-core";

/** The few calls the timer needs from MMKV (or any key-value store); `keys` lists every stored key. */
export type RawKv = { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void; keys(): string[] };

const ns = (userId: string) => `kizuna:user:${userId}:`;
const STATE_KEY = /^kizuna:pomodoro:([^:]+)$/;

/** The shared Pomodoro core's storage over a raw store: every key is namespaced by the user, as on the web. */
export function userScopedStorage(raw: RawKv, userId: string): KeyValueStorage {
  const p = ns(userId);
  return {
    getItem: (k) => raw.get(p + k),
    setItem: (k, v) => raw.set(p + k, v),
    removeItem: (k) => raw.remove(p + k),
  };
}

/** The habits of this user that have a stored timer state (not their prefs, tally or notification records). */
export function habitIdsOf(raw: RawKv, userId: string): string[] {
  const p = ns(userId);
  const out: string[] = [];
  for (const key of raw.keys()) {
    if (!key.startsWith(p)) continue;
    const m = STATE_KEY.exec(key.slice(p.length));
    if (m) out.push(m[1]);
  }
  return out;
}
