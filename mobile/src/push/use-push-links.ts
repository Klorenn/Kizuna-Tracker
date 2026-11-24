import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { mapWebPath } from "./map-web-path";

export type LinksApi = Pick<typeof Notifications, "getLastNotificationResponseAsync" | "addNotificationResponseReceivedListener">;

// The last response outlives a remount of the layout (logout then login): never open the same tap twice.
const handled = new Set<string>();
export const __resetHandled = () => handled.clear();

/**
 * A tap on a push (or on a local notification) opens the route of its `url`: the native screen when there is one, else the
 * WebView. Also from a killed app (the last response). Mounted once the session gate has passed, so the navigator is ready.
 */
export function usePushLinks(api: LinksApi = Notifications) {
  const router = useRouter();
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      const id = r.notification.request.identifier;
      if (handled.has(id)) return;
      const href = mapWebPath((r.notification.request.content.data as { url?: unknown } | null | undefined)?.url);
      if (!href) return;
      handled.add(id);
      router.push(href as never);
    };
    void api.getLastNotificationResponseAsync().then(open, () => undefined);
    const sub = api.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [api, router]);
}
