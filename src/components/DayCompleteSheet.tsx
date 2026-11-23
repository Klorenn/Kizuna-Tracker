"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CelebrationSheet } from "@/components/CelebrationSheet";
import { BookDoneSheet } from "@/components/logs/BookDoneSheet";
import { ReadingDoneSheet } from "@/components/logs/ReadingDoneSheet";
import {
  celebratedHabit,
  completedMealsHabit,
  type Celebration,
  type DayProgress,
  type HoyRowState,
  type HoyState,
} from "@/domain/day-complete";
import type { LocalDate } from "@/domain/types";
import { celebrationKey, claimCelebration, sessionStore } from "@/lib/celebrate-once";
import { celebrationsHeld, onCelebrationsReleased, takeReading } from "@/lib/celebration-bus";
import { watchStep, type Shown } from "@/lib/celebration-watch";
import type { CatAsset } from "@/lib/motion/cat-animation";

const COPY = {
  day: { title: "Día completo", body: "Completaste todos tus hábitos de hoy.", asset: "jump" },
  meals: { title: "Comidas del día completas", body: "Marcaste todas tus comidas de hoy.", asset: "eat" },
  rest: { title: "Descanso registrado", body: "Marcaste tu descanso de hoy.", asset: "sleep" },
  study: { title: "Estudio registrado", body: "Marcaste tu estudio de hoy.", asset: "code" },
} as const satisfies Record<string, { title: string; body: string; asset: CatAsset }>;
export type CelebrationKind = keyof typeof COPY;

/** "Día completo" (jump), "Comidas del día completas" (eat), "Descanso registrado" (sleep), "Estudio registrado" (code). */
export function DayCompleteSheet({
  kind,
  open,
  onClose,
}: {
  kind: CelebrationKind;
  open: boolean;
  onClose: () => void;
}) {
  const { title, body, asset } = COPY[kind];
  return (
    <CelebrationSheet open={open} title={title} asset={asset} onClose={onClose}>
      <p className="text-body text-muted">{body}</p>
    </CelebrationSheet>
  );
}

/** Once per (kind, habit or day, local date) per session: undo then redo does not celebrate again. */
function claim(kind: Celebration, before: HoyState, next: HoyState, today: LocalDate): boolean {
  // book and reading follow an explicit save in the reading sheet: they always show
  if (kind === "book" || kind === "reading") return true;
  const scope =
    kind === "meals"
      ? (completedMealsHabit(before, next) ?? "meals")
      : kind === "rest" || kind === "study"
        ? (celebratedHabit(kind, before, next) ?? kind)
        : "day";
  return claimCelebration(sessionStore(), celebrationKey(kind, scope, today));
}

/**
 * Lives on Hoy. Remembers the previous state across server refreshes, takes what the reading sheet
 * saved (celebration bus) and opens exactly one sheet: the first celebration, in priority order,
 * not yet claimed this session (watchStep). First render (including coming back from a photo
 * check-in, which remounts Hoy) never celebrates, so a gym check-in that completes the day shows
 * only its own sheet. While a reading sheet is open it defers and re-evaluates on release.
 */
export function DayCompleteWatcher({
  done,
  total,
  rows,
  today,
}: DayProgress & { rows: HoyRowState[]; today: LocalDate }) {
  const prev = useRef<HoyState | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const last = useRef<Shown>({ kind: "day", reading: null });
  const latest = useRef<HoyState>({ done, total, rows });
  latest.current = { done, total, rows };

  const evaluate = useCallback(() => {
    const step = watchStep(prev.current, latest.current, {
      held: celebrationsHeld,
      take: takeReading,
      claim: (kind, before, next) => claim(kind, before, next, today),
    });
    prev.current = step.prev;
    if (step.show) {
      last.current = step.show;
      setShown(step.show);
    }
  }, [today]);

  useEffect(() => {
    evaluate();
  }, [done, total, rows, evaluate]);
  useEffect(() => onCelebrationsReleased(evaluate), [evaluate]);

  const close = useCallback(() => setShown(null), []);
  const { kind, reading } = shown ?? last.current;
  const open = shown !== null;
  if (kind === "book") return <BookDoneSheet open={open} title={reading?.finishedTitle ?? ""} onClose={close} />;
  if (kind === "reading") return <ReadingDoneSheet open={open} pages={reading?.pages ?? 0} onClose={close} />;
  return <DayCompleteSheet kind={kind} open={open} onClose={close} />;
}
