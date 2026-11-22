"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { habitStreak } from "@/app/(app)/habitos/[id]/foto/actions";
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
  const [celebrate, setCelebrate] = useState<{ streakLabel: string | null } | null>(null);

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
            const info = await habitStreak(habitId);
            let streakLabel: string | null = null;
            if (info.ok) {
              if (info.streak > 0) streakLabel = `Racha de ${info.streak} ${info.unit}`;
              else if (info.weekly) streakLabel = `${info.weekly.count} de ${info.weekly.target} esta semana`;
            }
            setCelebrate({ streakLabel });
          }}
        />
      ) : (
        <CameraCapture title={title} timeZone={timeZone} onCapture={setBlob} onClose={leave} />
      )}
      <WorkoutDoneSheet open={celebrate !== null} streakLabel={celebrate?.streakLabel ?? null} onClose={leave} />
    </>
  );
}
