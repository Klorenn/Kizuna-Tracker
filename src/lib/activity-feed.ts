import "server-only";
import { addDays } from "@/domain/dates";
import { toHabitColor } from "@/domain/habit-colors";
import { avatarUrl } from "@/lib/avatar";
import { challengeFrequency } from "@/lib/challenge-view";
import {
  actionCopy,
  reviewStatus,
  STREAK_LOOKBACK_DAYS,
  streakContext,
  type CheckinKind,
  type FeedCursor,
  type FeedEntry,
  type FeedFilter,
  type FeedPage,
} from "@/lib/feed";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

export const FEED_PAGE = 20;
const SIGNED_SECONDS = 300;

type FeedRow = {
  id: string
  user_id: string
  habit_id: string
  local_date: string
  created_at: string
  photo_path: string | null
  rejected_at: string | null
  rejected_by: string | null
  habit_name: string | null
  habit_color: string | null
  habit_frequency_type: string | null
  habit_target_per_week: number | null
}

/**
 * A page of friends' check-ins, newest first, through the viewer's own session: the `friend_feed`
 * function runs as the caller (SECURITY INVOKER), so RLS limits it to accepted friends and
 * non-private habits, and a rejected check-in shows only to its owner and to whoever rejected it.
 * With `owner`, only that person (profile "Actividad"). Keyset pagination on (local_date,
 * created_at, id), so pages never overlap or skip when new rows arrive. Reads the newest rows of
 * each friend through an index instead of scanning every check-in in the table. `timezone` may still
 * be loading: the reads start without it and it is awaited only to format the times.
 */
export async function loadFeedPage(
  supabase: Supabase,
  me: string,
  opts: { timezone: string | Promise<string>; filter?: FeedFilter; cursor?: FeedCursor | null; owner?: string; limit?: number; now?: Date },
): Promise<FeedPage> {
  const { timezone, filter = "all", cursor = null, owner, limit = FEED_PAGE, now = new Date() } = opts;

  const { data, error } = await supabase.rpc("friend_feed", {
    p_limit: limit,
    p_cursor_day: cursor?.day,
    p_cursor_at: cursor?.at,
    p_cursor_id: cursor?.id,
    p_photos_only: filter === "photos",
    p_owner: owner,
  });
  if (error) throw new Error(error.message);
  const fetched = (data ?? []) as unknown as FeedRow[];
  const rows = fetched.slice(0, limit);
  const more = fetched.length > limit;
  if (rows.length === 0) return { items: [], next: null };

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const habitIds = [...new Set(rows.map((r) => r.habit_id))];
  const days = rows.map((r) => r.local_date).sort();
  const from = addDays(days[0], -STREAK_LOOKBACK_DAYS);
  const to = days[days.length - 1];
  const reviewable = rows.some(
    (r) => r.photo_path && !r.rejected_at && now.getTime() - new Date(r.created_at).getTime() < 24 * 3_600_000,
  );
  const photoPaths = rows.flatMap((r) => (r.photo_path ? [r.photo_path] : []));

  // everything the page needs besides the rows, in one parallel batch
  const [{ data: people }, history, { data: items }, { data: done }, { data: challenges }, signed] = await Promise.all([
    supabase.from("public_profiles").select("id,username,display_name,avatar_path,avatar_preset").in("id", userIds),
    // streak context: one row per habit with its dates since `from` (no row cap to page past)
    supabase.rpc("checkin_dates", { p_habit_ids: habitIds, p_from: from }),
    supabase.from("habit_items").select("habit_id").in("habit_id", habitIds).is("archived_at", null).limit(1000),
    // item check-ins of the days on the page: only habits made of items use them below
    supabase.from("checkin_items").select("habit_id,local_date").in("habit_id", habitIds).in("local_date", [...new Set(days)]).limit(1000),
    reviewable
      ? supabase
          .from("challenges")
          .select("id,creator_id,rival_id,creator_habit_id,rival_habit_id,status,requires_photo,starts_on,weeks")
          .eq("status", "active")
          .eq("requires_photo", true)
          .limit(1000)
      : Promise.resolve({ data: [] }),
    photoPaths.length
      ? supabase.storage.from("proofs").createSignedUrls(photoPaths, SIGNED_SECONDS)
      : Promise.resolve({ data: [] }),
  ]);
  if (history.error) throw new Error(history.error.message);

  // habits made of items: "Comer bien · 4 de 4" from the item check-ins of that day
  const itemTotal = new Map<string, number>();
  for (const i of items ?? []) itemTotal.set(i.habit_id, (itemTotal.get(i.habit_id) ?? 0) + 1);
  const itemDone = new Map<string, number>();
  for (const d of done ?? []) {
    if (!itemTotal.has(d.habit_id)) continue;
    const key = `${d.habit_id}|${d.local_date}`;
    itemDone.set(key, (itemDone.get(key) ?? 0) + 1);
  }

  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  // oldest first and up to the newest day on the page, as the streak context expects
  const datesByHabit = new Map<string, string[]>(
    (history.data ?? []).map((h) => [h.habit_id, h.dates.filter((d) => d <= to).sort()]),
  );
  const urlByPath = new Map(
    (signed.data ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])),
  );
  const clock = new Intl.DateTimeFormat("es-CL", { timeZone: await timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  const entries = rows.map((r): FeedEntry => {
    const p = byId.get(r.user_id);
    const name = p?.display_name ?? "Tu amigo";
    const habit = r.habit_name ?? "un hábito";
    const total = itemTotal.get(r.habit_id) ?? 0;
    // a check-in of an item habit exists once every item is done that day
    const done = itemDone.get(`${r.habit_id}|${r.local_date}`) ?? total;
    const kind: CheckinKind = r.photo_path
      ? { kind: "photo" }
      : total > 0
        ? { kind: "items", done, total: Math.max(total, done) }
        : { kind: "done" };
    return {
      id: r.id,
      cursor: { day: r.local_date, at: r.created_at, id: r.id },
      person: {
        id: r.user_id,
        username: p?.username ?? "",
        name,
        avatar: avatarUrl(p?.avatar_path ?? null),
        avatarPreset: p?.avatar_preset ?? null,
      },
      habit: { name: habit, color: toHabitColor(r.habit_color) },
      copy: actionCopy(habit, kind),
      localDate: r.local_date,
      time: clock.format(new Date(r.created_at)),
      hasPhoto: Boolean(r.photo_path),
      photoUrl: r.photo_path ? (urlByPath.get(r.photo_path) ?? null) : null,
      streak:
        r.rejected_at || r.habit_name === null
          ? null
          : streakContext(
              datesByHabit.get(r.habit_id) ?? [],
              r.local_date,
              challengeFrequency({ frequency_type: r.habit_frequency_type ?? "daily", target_per_week: r.habit_target_per_week }),
              from,
            ),
      status: reviewStatus(r, me, challenges ?? [], now),
    };
  });
  const last = rows[rows.length - 1];
  return { items: entries, next: more ? { day: last.local_date, at: last.created_at, id: last.id } : null };
}
