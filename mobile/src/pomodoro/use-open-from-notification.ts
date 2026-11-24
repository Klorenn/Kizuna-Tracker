import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { pomodoroPathOf } from "./notification-path";

/** A tap on the Pomodoro-end notification opens its screen, also from a killed app (the generic push routing arrives in M4). */
export function useOpenPomodoroFromNotification() {
  const router = useRouter();
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const path = pomodoroPathOf(r?.notification.request.content.data);
      if (!path) return;
      try {
        router.push(path as never);
      } catch {
        // the navigator was not ready yet (cold start): the timer screen is still one tap away from Hoy
      }
    };
    void Notifications.getLastNotificationResponseAsync().then(open, () => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
}
