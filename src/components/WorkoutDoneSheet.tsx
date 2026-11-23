"use client";

import { Flame } from "@phosphor-icons/react";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CatLift } from "@/components/brand/CatLift";
import type { LogType } from "@/domain/logs";
import { useCelebrationAutoClose } from "@/components/useCelebrationAutoClose";

/**
 * "Entrenamiento cumplido" (Figma 19 / 19b). Closes by itself after one full pass of the lifting cat
 * (+500 ms, counted from when its GIF loaded) or with "Listo". Any pointer, touch or keyboard
 * interaction inside the sheet cancels the auto-close. The dialog is named by its title and
 * described by the streak and note (no separate live region: that would announce it twice).
 */
export function WorkoutDoneSheet({
  open,
  streakLabel,
  note,
  logType,
  onClose,
  onLog,
}: {
  open: boolean;
  streakLabel: string | null;
  note: string;
  logType: LogType;
  onClose: () => void;
  /** "Registrar entrenamiento": the flow closes the sheet and moves to the logger. */
  onLog: () => void;
}) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  const auto = useCelebrationAutoClose(open, onClose, "lift");

  return (
    <Sheet open={open} title="Entrenamiento cumplido" onClose={onClose} initialFocusRef={doneRef} describedBy={bodyId}>
      <div
        className="flex flex-col gap-4"
        onPointerDown={auto.cancel}
        onTouchStart={auto.cancel}
        onKeyDown={auto.cancel}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <CatLift width={128} once onPlayStart={auto.start} />
          <div id={bodyId} className="flex w-full min-w-0 flex-col items-center gap-1">
            {streakLabel ? (
              <p className="flex items-center justify-center gap-1.5 font-mono text-[17px] font-medium text-ink">
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
        {logType === "workout" ? (
          <Button
            variant="secondary"
            onClick={() => {
              // moving to the logger: the sheet must not close by itself (nor go back to Hoy) meanwhile
              auto.cancel();
              onLog();
            }}
          >
            Registrar entrenamiento
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
