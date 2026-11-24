import "server-only";
import { localDate } from "@/domain/dates";
import { loadRecentWeights } from "@/app/(app)/perfil/body-data";
import { clipDates, loadCheckinDates, zoneFreeFrom, type DatesResult } from "@/lib/checkin-dates";
import { loadGoalsResult } from "@/lib/goals-data";
import { readRows } from "@/lib/read";
import { challengeRecord, STREAK_DAYS, streakWindow } from "@/lib/stats";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/**
 * Everything Perfil reads, in two serial levels after the session check (it was four). Level one
 * starts together: the profile, the habits, the challenge record, the debts, the weights and the goals
 * select (it needs the date only to build its windows). Level two is what truly depends on level one:
 * the check-in history (needs the habit ids; it asks from a zone-free date and is clipped to the exact
 * window once the time zone is known), the goals' history, and the debts of the finished challenges.
 * A failed habits or debts read throws (the error page), as before.
 */
export async function loadPerfilData<P extends { timezone: string }>(
  supabase: Supabase,
  userId: string,
  profileRead: Promise<P | null>,
  now: Date = new Date(),
) {
  const todayRead = profileRead.then((p) => localDate(now, p?.timezone ?? "UTC"));
  const habitsRead = Promise.resolve(
    supabase
      .from("habits")
      .select("id,name,color,frequency_type,target_per_week")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at"),
  );
  const datedRead: Promise<DatesResult> = habitsRead.then(({ data, error }) =>
    error ? { ok: false as const } : loadCheckinDates(supabase, (data ?? []).map((h) => h.id), zoneFreeFrom(now, STREAK_DAYS)),
  );
  const goalsPromise = loadGoalsResult(supabase, userId, todayRead);
  const [profile, habitsRes, record, debtsRes, bodyEntries, today, goalsRead, rawDated] = await Promise.all([
    profileRead,
    habitsRead,
    challengeRecord(userId, supabase),
    supabase.from("debts").select("id,debtor_id,creditor_id,amount,paid_at"),
    loadRecentWeights(supabase, userId, 5),
    todayRead,
    goalsPromise,
    datedRead,
  ]);
  if (!profile) return { profile: null, missingProfile: true as const };
  // a failed read is the error page, never an empty list or a zero balance
  const habitRows = readRows(habitsRes);
  const debtRows = readRows(debtsRes);
  const dated: DatesResult = rawDated.ok
    ? { ok: true, byHabit: clipDates(rawDated.byHabit, streakWindow(today).from) }
    : rawDated;
  return { profile, missingProfile: false as const, today, habitRows, debtRows, bodyEntries, record, goalsRead, dated };
}
