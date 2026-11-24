import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/session";
import { selectToday, type TodayRaw, type TodayView } from "./today";

/** The cached Hoy of the signed-in user (no request of its own: Hoy fetches it), as the view the screens draw. */
export function useCachedToday() {
  const userId = useSession().session?.user.id ?? "";
  const q = useQuery<TodayRaw, Error, TodayView>({ queryKey: ["today", userId], enabled: false, select: (raw) => selectToday(raw) });
  return { userId, view: q.data };
}
