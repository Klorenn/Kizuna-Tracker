"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CatEat } from "@/components/brand/CatEat";
import { CatJump } from "@/components/brand/CatJump";
import { useCelebrationAutoClose } from "@/components/useCelebrationAutoClose";
import {
  completedMealsHabit,
  pickCelebration,
  type DayProgress,
  type HoyRowState,
  type HoyState,
} from "@/domain/day-complete";
import type { LocalDate } from "@/domain/types";
import { celebrationKey, claimCelebration, sessionStore } from "@/lib/celebrate-once";

const COPY = {
  day: { title: "Día completo", body: "Completaste todos tus hábitos de hoy.", cat: CatJump, asset: "jump" },
  meals: { title: "Comidas del día completas", body: "Marcaste todas tus comidas de hoy.", cat: CatEat, asset: "eat" },
} as const;
export type CelebrationKind = keyof typeof COPY;

/**
 * Small celebration sheet ("Día completo" with the jumping cat, "Comidas del día completas" with the
 * eating cat). Same behavior as WorkoutDoneSheet: closes after one pass of the cat + 500 ms unless
 * the user interacts; named by its title and described by its body.
 */
export function DayCompleteSheet({
  kind,
  open,
  onClose,
}: {
  kind: CelebrationKind;
  open: boolean;
  onClose: () => void;
}) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  const { title, body, cat: Cat, asset } = COPY[kind];
  const auto = useCelebrationAutoClose(open, onClose, asset);

  return (
    <Sheet open={open} title={title} onClose={onClose} initialFocusRef={doneRef} describedBy={bodyId}>
      <div
        className="flex flex-col gap-4"
        onPointerDown={auto.cancel}
        onTouchStart={auto.cancel}
        onKeyDown={auto.cancel}
      >
        <div className="flex items-center gap-4">
          <Cat width={96} once onPlayStart={auto.start} />
          <p id={bodyId} className="min-w-0 flex-1 text-body text-muted">
            {body}
          </p>
        </div>
        <Button ref={doneRef} onClick={onClose}>
          Listo
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * Lives on Hoy. Remembers the previous done/total across server refreshes and opens the sheet when
 * the last pending habit gets completed. First render (including coming back from a photo check-in,
 * which remounts Hoy) never celebrates, so a gym check-in that completes the day shows only its own sheet.
 */
export function DayCompleteWatcher({
  done,
  total,
  rows,
  today,
}: DayProgress & { rows: HoyRowState[]; today: LocalDate }) {
  const prev = useRef<HoyState | null>(null);
  const [kind, setKind] = useState<CelebrationKind | null>(null);
  const last = useRef<CelebrationKind>("day");

  useEffect(() => {
    const next: HoyState = { done, total, rows };
    const before = prev.current;
    const pick = pickCelebration(before, next);
    // once per (kind, habit or day, local date) per session: undo then redo does not celebrate again
    const scope = pick === "meals" && before ? (completedMealsHabit(before, next) ?? "meals") : "day";
    if (pick && claimCelebration(sessionStore(), celebrationKey(pick, scope, today))) {
      last.current = pick;
      setKind(pick);
    }
    prev.current = next;
  }, [done, total, rows, today]);

  const close = useCallback(() => setKind(null), []);
  return <DayCompleteSheet kind={kind ?? last.current} open={kind !== null} onClose={close} />;
}
