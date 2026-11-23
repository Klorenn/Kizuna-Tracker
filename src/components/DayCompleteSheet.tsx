"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CatEat } from "@/components/brand/CatEat";
import { CatJump } from "@/components/brand/CatJump";
import { pickCelebration, type DayProgress, type HoyRowState, type HoyState } from "@/domain/day-complete";

/** Auto-close delay, same as the workout sheet. Any interaction cancels it. */
export const DAY_COMPLETE_SHEET_MS = 3000;

const COPY = {
  day: { title: "Día completo", body: "Completaste todos tus hábitos de hoy.", cat: CatJump },
  meals: { title: "Comidas del día completas", body: "Marcaste todas tus comidas de hoy.", cat: CatEat },
} as const;
export type CelebrationKind = keyof typeof COPY;

/** Small celebration sheet ("Día completo" with the jumping cat, "Comidas del día completas" with the eating cat). Mirrors WorkoutDoneSheet's behavior. */
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticFocus = useRef(false);
  const { title, body, cat: Cat } = COPY[kind];

  const cancelAutoClose = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // the first focus is ours, not the user's: it must not cancel the auto-close
    programmaticFocus.current = true;
    doneRef.current?.focus();
    programmaticFocus.current = false;
    timer.current = setTimeout(onClose, DAY_COMPLETE_SHEET_MS);
    return () => {
      cancelAutoClose();
      if (previous?.isConnected) previous.focus();
    };
  }, [open, onClose]);

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {open ? `${title}. ${body}` : ""}
      </p>
      <Sheet open={open} title={title} onClose={onClose}>
        <div
          className="flex flex-col gap-4"
          onPointerDown={cancelAutoClose}
          onTouchStart={cancelAutoClose}
          onKeyDown={cancelAutoClose}
          onFocus={() => {
            if (!programmaticFocus.current) cancelAutoClose();
          }}
        >
          <div className="flex items-center gap-4">
            <Cat width={96} once />
            <p className="min-w-0 flex-1 text-body text-muted">{body}</p>
          </div>
          <Button ref={doneRef} onClick={onClose}>
            Listo
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/**
 * Lives on Hoy. Remembers the previous done/total across server refreshes and opens the sheet when
 * the last pending habit gets completed. First render (including coming back from a photo check-in,
 * which remounts Hoy) never celebrates, so a gym check-in that completes the day shows only its own sheet.
 */
export function DayCompleteWatcher({ done, total, rows }: DayProgress & { rows: HoyRowState[] }) {
  const prev = useRef<HoyState | null>(null);
  const [kind, setKind] = useState<CelebrationKind | null>(null);
  const last = useRef<CelebrationKind>("day");

  useEffect(() => {
    const next: HoyState = { done, total, rows };
    const pick = pickCelebration(prev.current, next);
    if (pick) {
      last.current = pick;
      setKind(pick);
    }
    prev.current = next;
  }, [done, total, rows]);

  const close = useCallback(() => setKind(null), []);
  return <DayCompleteSheet kind={kind ?? last.current} open={kind !== null} onClose={close} />;
}
