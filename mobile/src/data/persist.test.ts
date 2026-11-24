import { CACHE_KEY, clearPersistedCache, kvStorage, persistOptions } from "./persist";

const fakeKv = () => {
  const mem = new Map<string, string>();
  return { mem, kv: { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v), remove: (k: string) => void mem.delete(k) } };
};

describe("persisted query cache", () => {
  it("the storage adapter round-trips a value and removes it", () => {
    const { kv } = fakeKv();
    const s = kvStorage(kv);
    expect(s.getItem("a")).toBeNull();
    s.setItem("a", "1");
    expect(s.getItem("a")).toBe("1");
    s.removeItem("a");
    expect(s.getItem("a")).toBeNull();
  });
  it("keeps the cache a day, busted by the app version", () => {
    const { kv } = fakeKv();
    const o = persistOptions(kv, "1.2.0");
    expect(o.maxAge).toBe(24 * 60 * 60 * 1000);
    expect(o.buster).toBe("1.2.0");
    expect(persistOptions(kv, "1.3.0").buster).toBe("1.3.0");
  });
  it("the persister writes under the cache key, and logout clears it", async () => {
    const { kv, mem } = fakeKv();
    const o = persistOptions(kv, "1.2.0");
    jest.useFakeTimers();
    await o.persister.persistClient({ timestamp: 1, buster: "1.2.0", clientState: { mutations: [], queries: [] } });
    jest.advanceTimersByTime(600); // the persister writes after its throttle
    jest.useRealTimers();
    expect(mem.has(CACHE_KEY)).toBe(true);
    expect(JSON.parse(mem.get(CACHE_KEY)!).buster).toBe("1.2.0");
    clearPersistedCache(kv);
    expect(mem.has(CACHE_KEY)).toBe(false);
  });
});
