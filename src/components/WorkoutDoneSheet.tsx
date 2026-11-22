"use client";

import { Flame } from "@phosphor-icons/react/dist/ssr";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CatLift } from "./CatLift";

export const WORKOUT_SHEET_MS = 3000;

/** "Entrenamiento cumplido" (Figma 19 / 19b). Closes by itself after 3 s or with "Listo". */
export function WorkoutDoneSheet({
  open,
  streakLabel,
  onClose,
}: {
  open: boolean;
  streakLabel: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, WORKOUT_SHEET_MS);
    return () => clearTimeout(t);
  }, [open, onClose]);

  return (
    <Sheet open={open} title="Entrenamiento cumplido" onClose={onClose}>
      <div className="flex items-center gap-4">
        <CatLift size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {streakLabel ? (
            <p className="flex items-center gap-1.5 font-mono text-[17px] font-medium text-ink">
              <Flame size={16} weight="light" aria-hidden />
              {streakLabel}
            </p>
          ) : null}
          <p className="text-body text-muted">Hecho. Mañana toca de nuevo.</p>
        </div>
      </div>
      <Button onClick={onClose}>Listo</Button>
    </Sheet>
  );
}
