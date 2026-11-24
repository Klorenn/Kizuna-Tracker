import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import Constants from "expo-constants";
import { AppState } from "react-native";
import { createMMKV } from "react-native-mmkv";
import { wireConnectivity } from "./connectivity";
import { persistOptions, type Kv } from "./persist";

const mmkv = createMMKV({ id: "cache" });

/** The MMKV instance of the persisted query cache (Hoy and the paused offline taps). */
export const cacheKv: Kv = { get: (k) => mmkv.getString(k) ?? null, set: (k, v) => mmkv.set(k, v), remove: (k) => void mmkv.remove(k) };

wireConnectivity({ netInfo: NetInfo, appState: AppState, onlineManager, focusManager });

export const persist = persistOptions(cacheKv, Constants.expoConfig?.version ?? "0");
