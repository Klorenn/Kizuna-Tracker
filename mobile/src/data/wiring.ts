import { createMMKV } from "react-native-mmkv";
import type { Kv } from "./persist";

const mmkv = createMMKV({ id: "cache" });

/** The MMKV instance older native builds cached Hoy in; only logout touches it now. */
export const cacheKv: Kv = { get: (k) => mmkv.getString(k) ?? null, set: (k, v) => mmkv.set(k, v), remove: (k) => void mmkv.remove(k) };
