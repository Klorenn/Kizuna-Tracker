import { AUTH_KEY_NAME, bytesToHex, createLargeSecureStore, type KvStore, type LargeSecureStoreDeps } from "./large-secure-store";

/** In-memory fakes: a SecureStore with one key slot, and an "encrypted" MMKV file that only opens with its own key. */
function harness(opts: { secureKey?: string; fileKey?: string; fileData?: Record<string, string> } = {}) {
  const secure = new Map<string, string>();
  if (opts.secureKey) secure.set(AUTH_KEY_NAME, opts.secureKey);
  // the "disk": the data written under the key it was encrypted with
  const disk = { key: opts.fileKey ?? null, data: { ...(opts.fileData ?? {}) } as Record<string, string> };
  const calls = { open: [] as string[], wipes: 0, randoms: 0 };
  const deps: LargeSecureStoreDeps = {
    secure: {
      getItemAsync: async (k) => secure.get(k) ?? null,
      setItemAsync: async (k, v) => void secure.set(k, v),
    },
    openStore(encryptionKey): KvStore {
      calls.open.push(encryptionKey);
      if (disk.key === null) disk.key = encryptionKey;
      // a wrong key reads as an empty store (what MMKV's discard-on-error recovery gives)
      const readable = () => (disk.key === encryptionKey ? disk.data : {});
      return {
        getString: (k) => readable()[k],
        set: (k, v) => { if (disk.key === encryptionKey) disk.data[k] = v; },
        remove: (k) => { delete readable()[k]; return true; },
        clearAll: () => { for (const k of Object.keys(readable())) delete disk.data[k]; },
      };
    },
    deleteStore: () => { calls.wipes++; disk.key = null; disk.data = {}; },
    randomKey: () => `key-${++calls.randoms}`,
  };
  return { deps, secure, disk, calls };
}

describe("createLargeSecureStore", () => {
  it("round-trips a session through setItem and getItem, and removeItem deletes it", async () => {
    const h = harness();
    const store = createLargeSecureStore(h.deps);
    await store.setItem("sb-session", '{"access_token":"a.b.c"}');
    expect(await store.getItem("sb-session")).toBe('{"access_token":"a.b.c"}');
    await store.removeItem("sb-session");
    expect(await store.getItem("sb-session")).toBeNull();
  });

  it("first launch: no key yet generates one, stores it in SecureStore and opens the store with it", async () => {
    const h = harness();
    const store = createLargeSecureStore(h.deps);
    await store.setItem("k", "v");
    expect(h.secure.get(AUTH_KEY_NAME)).toBe("key-1");
    expect(h.calls.open).toEqual(["key-1"]);
  });

  it("reuses the stored key across restarts and keeps the data (no wipe)", async () => {
    const h = harness({ secureKey: "key-A", fileKey: "key-A", fileData: { "sb-session": "kept" } });
    const store = createLargeSecureStore(h.deps);
    expect(await store.getItem("sb-session")).toBe("kept");
    expect(h.calls.wipes).toBe(0);
    expect(h.calls.open).toEqual(["key-A"]);
  });

  it("missing key (SecureStore cleared) wipes the old ciphertext, so the user is signed out", async () => {
    const h = harness({ fileKey: "key-OLD", fileData: { "sb-session": "stale-ciphertext" } });
    const store = createLargeSecureStore(h.deps);
    expect(await store.getItem("sb-session")).toBeNull();
    expect(h.calls.wipes).toBe(1);
    expect(h.secure.get(AUTH_KEY_NAME)).toBe("key-1");
    expect(h.disk.data).toEqual({});
    await store.setItem("sb-session", "fresh");
    expect(await store.getItem("sb-session")).toBe("fresh");
  });

  it("opens the store once for concurrent first calls", async () => {
    const h = harness();
    const store = createLargeSecureStore(h.deps);
    await Promise.all([store.getItem("a"), store.getItem("b"), store.setItem("c", "d")]);
    expect(h.calls.open).toHaveLength(1);
    expect(h.calls.randoms).toBe(1);
  });

  it("clear() empties the store", async () => {
    const h = harness({ secureKey: "k", fileKey: "k", fileData: { a: "1", b: "2" } });
    const store = createLargeSecureStore(h.deps);
    await store.clear();
    expect(await store.getItem("a")).toBeNull();
    expect(await store.getItem("b")).toBeNull();
  });
});

describe("bytesToHex", () => {
  it("encodes 16 random bytes as 32 lower-case hex characters", () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
    expect(bytesToHex(new Uint8Array(16).fill(171))).toBe("ab".repeat(16));
  });
});
