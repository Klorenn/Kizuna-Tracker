import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { CACHE_MAX_AGE } from "./query-client";

export const CACHE_KEY = "kz-rq-v1";

export type Kv = { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };

/** The synchronous Storage shape the TanStack persister wants, over any key-value store (MMKV in the app). */
export const kvStorage = (kv: Kv) => ({
  getItem: (k: string) => kv.get(k),
  setItem: (k: string, v: string) => kv.set(k, v),
  removeItem: (k: string) => kv.remove(k),
});

/**
 * What PersistQueryClientProvider needs: Hoy and the paused (offline) taps survive a restart for a day. The buster is the
 * app version, so a new build never restores a cache shaped by an old one.
 */
export function persistOptions(kv: Kv, version: string) {
  return { persister: createSyncStoragePersister({ storage: kvStorage(kv), key: CACHE_KEY, throttleTime: 500 }), maxAge: CACHE_MAX_AGE, buster: version };
}

/** Logout: nothing of this account stays on the device. */
export const clearPersistedCache = (kv: Kv) => kv.remove(CACHE_KEY);
