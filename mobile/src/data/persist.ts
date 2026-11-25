/** The key earlier native builds persisted Hoy's query cache under (MMKV "cache"). The app is the web now; logout still wipes it. */
export const CACHE_KEY = "kz-rq-v1";

export type Kv = { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };

/** Logout: nothing of this account stays on the device. */
export const clearPersistedCache = (kv: Kv) => kv.remove(CACHE_KEY);
