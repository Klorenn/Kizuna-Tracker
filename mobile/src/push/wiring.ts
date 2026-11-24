import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { createMMKV } from "react-native-mmkv";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";
import { pushTokenRequest } from "./push-api";
import { createPushRegistrar } from "./registrar";

const mmkv = createMMKV({ id: "push" });

// A push that arrives with the app open is shown too (the default is to drop it).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

const call = (method: "POST" | "DELETE") => async (token: string) => {
  const jwt = await accessToken();
  return jwt ? pushTokenRequest(env().apiUrl, method, jwt, token) : false;
};

/** The device's push: default channel, in-context permission, Expo token on /api/m/push-token (bearer). */
export const pushRegistrar = createPushRegistrar({
  notifications: Notifications,
  api: { register: call("POST"), unregister: call("DELETE") },
  store: { get: (k) => mmkv.getString(k) ?? null, set: (k, v) => mmkv.set(k, v), remove: (k) => void mmkv.remove(k) },
  projectId: (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? "",
});
