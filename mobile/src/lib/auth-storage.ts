import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createMMKV, deleteMMKV } from "react-native-mmkv";
import { bytesToHex, createLargeSecureStore } from "./large-secure-store";

const STORE_ID = "auth";

/** The Supabase session store: MMKV `auth` encrypted with a random key kept in SecureStore under `kz_auth_key`. */
export const authStorage = createLargeSecureStore({
  secure: SecureStore,
  openStore: (encryptionKey) => createMMKV({ id: STORE_ID, encryptionKey, recoveryStrategy: "discard-on-error" }),
  deleteStore: () => void deleteMMKV(STORE_ID),
  randomKey: () => bytesToHex(Crypto.getRandomBytes(16)),
});
