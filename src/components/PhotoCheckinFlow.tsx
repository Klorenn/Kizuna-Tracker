"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Loading from "@/app/(app)/loading";
import LoggerLoading from "@/app/(app)/habitos/[id]/entrenamiento/loading";
import { habitStreak } from "@/app/(app)/habitos/[id]/foto/actions";
import { localDate } from "@/domain/dates";
import { celebrateKeyAndClaim } from "@/lib/celebrate-once";
import { celebrationFor } from "@/lib/checkins";
import type { LogType } from "@/domain/logs";
import type { PresetKey } from "@/domain/presets";
import { CameraCapture } from "./CameraCapture";
import { PhotoReview } from "./PhotoReview";
import { WorkoutDoneSheet } from "./WorkoutDoneSheet";

/** If the destination has not rendered by then, stop waiting on the client-side navigation and load it for real. */
const LEAVE_FALLBACK_MS = 8_000;

/** Camera -> review -> upload -> (Gym only) celebration -> back to Hoy. */
export function PhotoCheckinFlow({
  habitId,
  itemId,
  title,
  preset,
  logType,
  timeZone,
}: {
  habitId: string;
  itemId: string | null;
  title: string;
  preset: PresetKey | null;
  logType: LogType;
  timeZone: string;
}) {
  const router = useRouter();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [celebrate, setCelebrate] = useState<{ streakLabel: string | null; note: string } | null>(null);

  // Destination while leaving (null = still here). One mechanism for both exits (Hoy, the logger):
  // never waits for the network, the sheet closes now and a skeleton of the destination stays behind.
  const [leaving, setLeaving] = useState<string | null>(null);
  const left = useRef(false);

  // replace("/") already renders Hoy fresh (dynamic pages are not cached on the client), so there is
  // no router.refresh() on top of it. replace, not push: the camera page of a checked-in habit must
  // not stay in the history.
  const goTo = useCallback((href: string) => {
    if (left.current) return;
    left.current = true;
    setLeaving(href);
    router.replace(href);
  }, [router]);
  const leave = useCallback(() => goTo("/"), [goTo]);

  // A client-side navigation can hang (flaky network, a build that no longer matches): never strand the user.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => window.location.assign(leaving), LEAVE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <>
      {leaving ? leaving === "/" ? <Loading /> : <LoggerLoading /> : celebrate ? null : blob ? (
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
      <WorkoutDoneSheet open={celebrate !== null && leaving === null} streakLabel={celebrate?.streakLabel ?? null}
        note={celebrate?.note ?? ""}
        logType={logType}
        onClose={leave}
        onLog={() => goTo(`/habitos/${habitId}/entrenamiento`)} />
    </>
  );
}
