import type * as Notifications from "expo-notifications";

type Api = Pick<
  typeof Notifications,
  "getPermissionsAsync" | "requestPermissionsAsync" | "setNotificationChannelAsync" | "scheduleNotificationAsync" | "cancelScheduledNotificationAsync"
>;

const CHANNEL = "pomodoro";

/**
 * Schedules the end of a phase (focus or break) as a local notification (it fires with the app backgrounded or killed; Doze can delay it
 * by minutes, the block is still credited correctly). Permission is asked here, in context, never at launch, and never
 * again once the system says it cannot be asked. Without permission the timer still works: the id is null.
 */
export function createNotificationScheduler(api: Api) {
  return {
    async schedule({ at, habitId, title, body, silent }: { at: number; habitId: string; title: string; body: string; silent?: boolean }): Promise<string | null> {
      try {
        let perm = await api.getPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await api.requestPermissionsAsync();
        if (!perm.granted) return null;
        await api.setNotificationChannelAsync(CHANNEL, { name: "Pomodoro", importance: 4 /* HIGH */ });
        return await api.scheduleNotificationAsync({
          content: {
            title,
            body,
            sound: silent ? false : true,
            data: { url: `/registros/${habitId}/pomodoro` },
          },
          trigger: { type: "date", date: new Date(at), channelId: CHANNEL } as never,
        });
      } catch {
        return null;
      }
    },
    async cancel(notificationId: string): Promise<void> {
      try {
        await api.cancelScheduledNotificationAsync(notificationId);
      } catch {
        // already fired or gone: nothing to cancel
      }
    },
  };
}
