/**
 * Supabase session storage that survives restarts and is encrypted at rest: the session lives in an MMKV instance
 * encrypted with a random key, and that key lives in expo-secure-store (Android Keystore). Pure: every native piece is
 * injected (see auth-storage.ts for the real wiring), so it is testable without a device.
 *
 * If the key is missing (SecureStore cleared, restored backup, reinstall) the ciphertext is unreadable, so the old
 * store is wiped and the user is signed out instead of failing on garbage.
 */
export const AUTH_KEY_NAME = "kz_auth_key";

export interface SecureKeyStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

/** The slice of an MMKV instance used here. */
export interface KvStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean | void;
  clearAll(): void;
}

export interface LargeSecureStoreDeps {
  secure: SecureKeyStore;
  openStore(encryptionKey: string): KvStore;
  /** Deletes the encrypted store file (nothing to delete on a first launch). */
  deleteStore(): void;
  randomKey(): string;
}

/** supabase-js `SupportedStorage` plus `clear` for logout. */
export interface LargeSecureStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createLargeSecureStore(deps: LargeSecureStoreDeps): LargeSecureStore {
  let opening: Promise<KvStore> | null = null;

  async function open(): Promise<KvStore> {
    let key = await deps.secure.getItemAsync(AUTH_KEY_NAME);
    if (!key) {
      deps.deleteStore();
      key = deps.randomKey();
      await deps.secure.setItemAsync(AUTH_KEY_NAME, key);
    }
    return deps.openStore(key);
  }

  const store = () => (opening ??= open());

  return {
    async getItem(key) {
      return (await store()).getString(key) ?? null;
    },
    async setItem(key, value) {
      (await store()).set(key, value);
    },
    async removeItem(key) {
      (await store()).remove(key);
    },
    async clear() {
      (await store()).clearAll();
    },
  };
}
