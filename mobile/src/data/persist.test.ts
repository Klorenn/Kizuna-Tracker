import { CACHE_KEY, clearPersistedCache } from "./persist";

describe("legacy offline cache", () => {
  it("logout clears what earlier native builds persisted under the cache key", () => {
    const mem = new Map<string, string>([[CACHE_KEY, "{}"]]);
    const kv = { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v), remove: (k: string) => void mem.delete(k) };
    clearPersistedCache(kv);
    expect(mem.has(CACHE_KEY)).toBe(false);
  });
});
