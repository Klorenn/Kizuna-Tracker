"use client";

import { Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { loadWatchMedia } from "@/app/(app)/series/picker-actions";
import type { PickerMedia } from "@/app/(app)/series/media-data";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { holdCelebrations } from "@/lib/celebration-bus";
import { WatchForm, watchTitle, type WatchSheetMode } from "./logs/WatchSheet";

type Titles = { status: "loading" } | { status: "ready"; media: PickerMedia[] } | { status: "failed"; error: string };

/**
 * Hoy's "¿Qué viste hoy?": the same sheet as `WatchSheet`, but it reads your titles when it opens
 * (a server action) instead of Hoy carrying them for everyone. While they load, and on a failed
 * read, the sheet says so and offers a retry; it never shows an empty list of titles.
 */
export function HabitWatchSheet({
  habitId,
  onClose,
  onSaved,
}: {
  habitId: string;
  onClose: () => void;
  onSaved?: (message: string) => void;
}) {
  const mode: WatchSheetMode = { kind: "checkin", habitId };
  const [titles, setTitles] = useState<Titles>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // no celebration on top of this sheet while its titles load (the form holds them once it shows)
  useEffect(() => holdCelebrations(), []);

  useEffect(() => {
    let live = true;
    loadWatchMedia()
      .then((r) => {
        if (live) setTitles(r.ok ? { status: "ready", media: r.media } : { status: "failed", error: r.error });
      })
      .catch(() => {
        if (live) setTitles({ status: "failed", error: "No pudimos cargar tus títulos. Inténtalo de nuevo." });
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setTitles({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return (
    <Sheet open title={watchTitle(mode)} onClose={onClose} tall>
      {titles.status === "ready" ? (
        <WatchForm mode={mode} media={titles.media} onFinished={onClose} onSaved={onSaved} />
      ) : titles.status === "loading" ? (
        <p role="status" className="py-6 text-center text-body text-muted">
          Cargando tus títulos…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p role="alert" className="flex items-center gap-1 text-small text-ink">
            <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
            {titles.error}
          </p>
          <Button onClick={retry}>Reintentar</Button>
        </div>
      )}
    </Sheet>
  );
}
