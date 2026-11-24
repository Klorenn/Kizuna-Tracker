import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WorkoutDraft } from "@/domain/logs";
import type { BookInput, ExerciseRef } from "@/domain/logs";
import type { MediaInput } from "@/domain/watch";
import type { CardioInput } from "@/lib/cardio-copy";
import {
  addCardioRpc,
  checkInWithCardioRpc,
  checkInWithReadingRpc,
  checkInWithWatchRpc,
  createBookRpc,
  createExerciseRpc,
  createMediaRpc,
  deleteCardioRpc,
  deleteReadingRpc,
  deleteWatchRpc,
  deleteWorkoutRpc,
  saveReadingRpc,
  saveWatchRpc,
  saveWorkoutRpc,
  updateCardioRpc,
  type CheckInThenResult,
  type LogResult,
} from "@/lib/logs-rpc";
import type { ReadingInput } from "@/lib/reading-copy";
import { checkInRpc } from "@/lib/tracking-rpc";
import type { WatchInput } from "@/lib/watch-copy";

type Deps = {
  client: () => SupabaseClient<Database>;
  userId: string;
  habitId: string;
  /** today's check-in of the habit, when it has one */
  checkinId: () => string | null;
  /** re-reads Hoy after a write */
  refresh: () => void | Promise<unknown>;
};

const NO_CHECKIN = "Ese día no tiene check-in.";
const OK: LogResult = { ok: true };

/**
 * What the log screens (reading, workout, cardio, watch) do on Save. They are online writes, not queued taps: the
 * result goes back to the screen, which shows the web copy. With today's check-in the entry is saved on it; without
 * one the habit is checked in first. When the entry is lost after the check-in, Hoy is still refreshed because the
 * habit is now done.
 */
export function makeLogActions(d: Deps) {
  const settle = async (r: CheckInThenResult): Promise<LogResult> => {
    if (r.ok || r.checkedIn) await d.refresh();
    return r.ok ? OK : { ok: false, error: r.error };
  };
  const after = async (r: LogResult): Promise<LogResult> => {
    if (r.ok) await d.refresh();
    return r;
  };
  /** a created book, title or exercise shows up in the screen's list */
  const created = async <R extends { ok: boolean }>(r: R): Promise<R> => {
    if (r.ok) await d.refresh();
    return r;
  };
  const withCheckin = async (fn: (checkinId: string) => Promise<LogResult>): Promise<LogResult> => {
    const id = d.checkinId();
    return id ? after(await fn(id)) : { ok: false, error: NO_CHECKIN };
  };

  return {
    reading: {
      onSave: async (entry: ReadingInput) => {
        const id = d.checkinId();
        return id ? after(await saveReadingRpc(d.client(), id, entry)) : settle(await checkInWithReadingRpc(d.client(), d.habitId, entry));
      },
      onMark: async () => (d.checkinId() ? OK : settle(await checkInWithReadingRpc(d.client(), d.habitId, null))),
      onDelete: () => withCheckin((id) => deleteReadingRpc(d.client(), id)),
      onCreateBook: async (input: BookInput) => created(await createBookRpc(d.client(), d.userId, input)),
    },
    workout: {
      onSave: async (draft: WorkoutDraft): Promise<LogResult> => {
        let id = d.checkinId();
        if (!id) {
          const c = await checkInRpc(d.client(), d.habitId);
          if (!c.ok) return { ok: false, error: c.error };
          id = c.checkinId;
        }
        const r = await saveWorkoutRpc(d.client(), id, draft);
        // the check-in happened (or already existed): Hoy changes either way
        await d.refresh();
        return r;
      },
      onDelete: () => withCheckin((id) => deleteWorkoutRpc(d.client(), id)),
      onCreateExercise: async (input: Pick<ExerciseRef, "name" | "group">) => created(await createExerciseRpc(d.client(), d.userId, input)),
    },
    cardio: {
      onSave: async (entry: CardioInput): Promise<LogResult> => {
        const id = d.checkinId();
        if (!id) return settle(await checkInWithCardioRpc(d.client(), d.habitId, entry));
        const r = await addCardioRpc(d.client(), id, entry);
        return after(r.ok ? OK : r);
      },
      onUpdate: async (entryId: string, entry: CardioInput) => after(await updateCardioRpc(d.client(), entryId, entry)),
      onDelete: async (entryId: string) => after(await deleteCardioRpc(d.client(), entryId)),
      onMark: async () => (d.checkinId() ? OK : settle(await checkInWithCardioRpc(d.client(), d.habitId, null))),
    },
    watch: {
      onSave: async (entry: WatchInput) => {
        const id = d.checkinId();
        return id ? after(await saveWatchRpc(d.client(), id, entry)) : settle(await checkInWithWatchRpc(d.client(), d.habitId, entry));
      },
      onMark: async () => (d.checkinId() ? OK : settle(await checkInWithWatchRpc(d.client(), d.habitId, null))),
      onDelete: () => withCheckin((id) => deleteWatchRpc(d.client(), id)),
      onCreateMedia: async (input: MediaInput) => created(await createMediaRpc(d.client(), d.userId, input)),
    },
  };
}
