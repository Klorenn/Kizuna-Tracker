import type * as Notifications from "expo-notifications";

type NotificationsApi = Pick<
  typeof Notifications,
  "getPermissionsAsync" | "requestPermissionsAsync" | "getExpoPushTokenAsync" | "setNotificationChannelAsync" | "addPushTokenListener"
>;

/** ask = the prompt can still be shown; blocked = denied and the system will not ask again (Settings only). */
export type PermissionState = "granted" | "ask" | "blocked";

export type PushRegistrarDeps = {
  notifications: NotificationsApi;
  api: { register(token: string): Promise<boolean>; unregister(token: string): Promise<boolean> };
  store: { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };
  projectId: string;
};

const CHANNEL = "default";
const TOKEN_KEY = "token";
const HIGH = 4; // Notifications.AndroidImportance.HIGH

/**
 * Push on the device: the default channel, the permission (asked only on an explicit tap, never again once the system
 * says it cannot ask), and the Expo token registered on the server and re-registered when the device token rotates.
 * Every call is best effort: no network or no Firebase config must never break the app.
 */
export function createPushRegistrar({ notifications, api, store, projectId }: PushRegistrarDeps) {
  async function ensureChannel(): Promise<void> {
    try {
      await notifications.setNotificationChannelAsync(CHANNEL, { name: "Kizuna", importance: HIGH });
    } catch {
      // not Android, or already there
    }
  }

  async function permission(): Promise<PermissionState> {
    const p = await notifications.getPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "ask" : "blocked";
  }

  async function registerCurrent(): Promise<void> {
    try {
      const { data } = await notifications.getExpoPushTokenAsync({ projectId });
      if (await api.register(data)) store.set(TOKEN_KEY, data);
    } catch {
      // no token available right now: the next sync retries
    }
  }

  return {
    ensureChannel,
    permission,
    /** The in-context prompt. Registers the token when granted. */
    async enable(): Promise<PermissionState> {
      await ensureChannel(); // Android 13 needs the channel to exist before the prompt
      let state = await permission();
      if (state === "ask") {
        const asked = await notifications.requestPermissionsAsync();
        state = asked.granted ? "granted" : asked.canAskAgain ? "ask" : "blocked";
      }
      if (state === "granted") await registerCurrent();
      return state;
    },
    /** After login / on open: when already granted, (re)register this device. Never prompts. */
    async sync(): Promise<void> {
      await ensureChannel();
      try {
        if ((await permission()) === "granted") await registerCurrent();
      } catch {
        // permission read failed: nothing to register
      }
    },
    /** A rotated device token yields a new Expo token: register it (the server replaces the old row). */
    watchRotation(): () => void {
      const sub = notifications.addPushTokenListener(() => void registerCurrent());
      return () => sub.remove();
    },
    /** Logout, best effort: delete this device's token from the server (needs the session still valid) and forget it. */
    async unregister(): Promise<void> {
      const token = store.get(TOKEN_KEY);
      if (!token) return;
      await api.unregister(token);
      store.remove(TOKEN_KEY);
    },
  };
}
