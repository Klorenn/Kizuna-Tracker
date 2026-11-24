import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { cacheKv } from "../data/wiring";
import { clearPersistedCache } from "../data/persist";
import { authStorage } from "../lib/auth-storage";
import { supabase } from "../lib/supabase";
import { pushRegistrar } from "../push/wiring";
import { wipeWebSession } from "../web/cookie-wiper";
import { createLogout } from "./logout";

/**
 * Logout of the whole app: push token, scheduled notifications, session (this device only), query cache and its MMKV copy,
 * the encrypted auth store, the WebView cookies, then the native login. The web's sign-out lands here too.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMemo(
    () =>
      createLogout({
        unregisterPush: () => pushRegistrar.unregister(),
        cancelScheduled: () => Notifications.cancelAllScheduledNotificationsAsync(),
        signOut: async () => void (await supabase().auth.signOut({ scope: "local" })),
        clearQueries: () => queryClient.clear(),
        clearPersisted: () => clearPersistedCache(cacheKv),
        clearAuthStore: () => authStorage.clear(),
        wipeWebSession,
        goToLogin: () => router.replace("/login"),
      }),
    [queryClient, router],
  );
}
