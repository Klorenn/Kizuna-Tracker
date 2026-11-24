import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { createMMKV } from "react-native-mmkv";
import { createNotificationScheduler } from "./notifications";
import { createPomodoroStore } from "./store";

const mmkv = createMMKV({ id: "pomodoro" });

/** The app's one Pomodoro timer: persisted in MMKV, ending as a scheduled local notification. */
export const pomodoroStore = createPomodoroStore({
  storage: { get: (k) => mmkv.getString(k) ?? null, set: (k, v) => mmkv.set(k, v), remove: (k) => void mmkv.remove(k) },
  scheduler: createNotificationScheduler(Notifications),
  now: Date.now,
  newId: () => Crypto.randomUUID(),
});
