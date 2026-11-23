"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CatJump } from "@/components/brand/CatJump";
import { shouldCelebrateDay, type DayProgress } from "@/domain/day-complete";

/** Auto-close delay, same as the workout sheet. Any interaction cancels it. */
export const DAY_COMPLETE_SHEET_MS = 3000;

/** "Día completo": small celebration with the jumping cat. Mirrors WorkoutDoneSheet's behavior. */
export function DayCompleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticFocus = useRef(false);

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
        {open ? "Día completo. Completaste todos tus hábitos de hoy." : ""}
      </p>
      <Sheet open={open} title="Día completo" onClose={onClose}>
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
            <CatJump width={96} once />
            <p className="min-w-0 flex-1 text-body text-muted">Completaste todos tus hábitos de hoy.</p>
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
export function DayCompleteWatcher({ done, total }: DayProgress) {
  const prev = useRef<DayProgress | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shouldCelebrateDay(prev.current, { done, total })) setOpen(true);
    prev.current = { done, total };
  }, [done, total]);

  const close = useCallback(() => setOpen(false), []);
  return <DayCompleteSheet open={open} onClose={close} />;
}
