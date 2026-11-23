"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { habitStreak } from "@/app/(app)/habitos/[id]/foto/actions";
import { localDate } from "@/domain/dates";
import { celebrateKeyAndClaim } from "@/lib/celebrate-once";
import { celebrationFor } from "@/lib/checkins";
import type { PresetKey } from "@/domain/presets";
import { CameraCapture } from "./CameraCapture";
import { PhotoReview } from "./PhotoReview";
import { WorkoutDoneSheet } from "./WorkoutDoneSheet";

/** Camera -> review -> upload -> (Gym only) celebration -> back to Hoy. */
export function PhotoCheckinFlow({
  habitId,
  itemId,
  title,
  preset,
  timeZone,
}: {
  habitId: string;
  itemId: string | null;
  title: string;
  preset: PresetKey | null;
  timeZone: string;
}) {
  const router = useRouter();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [celebrate, setCelebrate] = useState<{ streakLabel: string | null; note: string } | null>(null);

  const leave = useCallback(() => {
    router.replace("/");
    router.refresh();
  }, [router]);

  return (
    <>
      {celebrate ? null : blob ? (
        <PhotoReview
          blob={blob}
          field={itemId ? "itemId" : "habitId"}
          targetId={itemId ?? habitId}
          timeZone={timeZone}
          onRetake={() => setBlob(null)}
          onDone={async (result) => {
            if (celebrationFor({ preset }, result) !== "workout") return leave();
            // once per habit and local day per session
            if (!celebrateKeyAndClaim("workout", habitId, localDate(new Date(), timeZone))) return leave();
            const info = await habitStreak(habitId);
            let streakLabel: string | null = null;
            if (info.ok) {
              if (info.streak > 0) streakLabel = `Racha de ${info.streak} ${info.unit}`;
              else if (info.weekly) streakLabel = `${info.weekly.count} de ${info.weekly.target} esta semana`;
            }
            const note = info.ok && info.weekly
              ? `Hecho. Vas ${info.weekly.count} de ${info.weekly.target} esta semana.`
              : "Hecho. Mañana toca de nuevo.";
            setCelebrate({ streakLabel, note });
          }}
        />
      ) : (
        <CameraCapture title={title} onCapture={setBlob} onClose={leave} />
      )}
      <WorkoutDoneSheet open={celebrate !== null} streakLabel={celebrate?.streakLabel ?? null}
        note={celebrate?.note ?? ""}
        onClose={leave} />
    </>
  );
}
