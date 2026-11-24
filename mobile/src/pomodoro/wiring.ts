import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { createMMKV } from "react-native-mmkv";
import { createPomodoroEngine } from "./engine";
import { userScopedStorage, type RawKv } from "./kv";
import { createNotificationScheduler } from "./notifications";

const mmkv = createMMKV({ id: "pomodoro" });

/** The MMKV instance of the timers, as the few calls the shared Pomodoro core needs. */
export const rawKv: RawKv = {
  get: (k) => mmkv.getString(k) ?? null,
  set: (k, v) => mmkv.set(k, v),
  remove: (k) => void mmkv.remove(k),
  keys: () => mmkv.getAllKeys(),
};

export const scheduler = createNotificationScheduler(Notifications);
export const storageFor = (userId: string) => userScopedStorage(rawKv, userId);

/** The Pomodoro of one habit of one user: shared reducer, MMKV storage, one local notification per phase end. */
export const createEngineFor = (userId: string, habitId: string, habitName: string) =>
  createPomodoroEngine({ habitId, habitName, storage: storageFor(userId), scheduler, now: Date.now, newId: () => Crypto.randomUUID() });
