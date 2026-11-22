"use client";

import { Flame } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CatLift } from "./CatLift";

/** Auto-close delay. The cat's GIF pass (6 s) is longer: the sheet closes mid-lift unless the user interacts. */
export const WORKOUT_SHEET_MS = 3000;

/**
 * "Entrenamiento cumplido" (Figma 19 / 19b). Closes by itself after 3 s or with "Listo".
 * Any pointer, touch or keyboard interaction inside the sheet cancels the auto-close.
 */
export function WorkoutDoneSheet({
  open,
  streakLabel,
  note,
  onClose,
}: {
  open: boolean;
  streakLabel: string | null;
  note: string;
  onClose: () => void;
}) {
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
    timer.current = setTimeout(onClose, WORKOUT_SHEET_MS);
    return () => {
      cancelAutoClose();
      if (previous?.isConnected) previous.focus();
    };
  }, [open, onClose]);

  const announcement = open ? ["Entrenamiento cumplido", streakLabel, note].filter(Boolean).join(". ") : "";

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <Sheet open={open} title="Entrenamiento cumplido" onClose={onClose}>
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
            <CatLift size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {streakLabel ? (
                <p className="flex items-center gap-1.5 font-mono text-[17px] font-medium text-ink">
                  <Flame size={16} weight="light" aria-hidden />
                  {streakLabel}
                </p>
              ) : null}
              <p className="text-body text-muted">{note}</p>
            </div>
          </div>
          <Button ref={doneRef} onClick={onClose}>
            Listo
          </Button>
        </div>
      </Sheet>
    </>
  );
}
