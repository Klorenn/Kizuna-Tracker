"use client";

/**
 * WatchSheet ("¿Qué viste hoy?") and WatchForm (the same form on the day page, /habitos/<id>/visto).
 * Self-contained, plain props, for Hoy (Task 28) and the day editor:
 *
 * - `open`: whether the sheet is shown. Render it only while open (the form starts from its props).
 * - `onClose`: called by the close button, the backdrop and after a successful save, skip or delete.
 *   The close button never checks anything.
 * - `mode`: `{ kind: "checkin"; habitId }` on Hoy ("Guardar" checks the habit in and saves what you
 *   watched; "Solo marcar" only checks it in) or `{ kind: "edit"; checkinId; entry }` for any day that
 *   has a check-in (add, edit or delete the entry; never touches the check-in).
 * - `media`: the titles you are watching (`loadPickerMedia` in `app/(app)/series/media-data.ts`).
 * - `onSaved?`: edit mode and check-in mode, after a save or delete, with the toast message.
 */

import { Minus, Plus, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { checkInWithWatch, deleteWatch, saveWatch, type WatchInput } from "@/app/(app)/registros/watch-actions";
import type { PickerMedia } from "@/app/(app)/series/media-data";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { formatDuration } from "@/domain/time";
import { validateWatchInput } from "@/domain/watch";
import { holdCelebrations } from "@/lib/celebration-bus";
import { MediaPicker } from "./MediaPicker";

export type WatchEntryValues = {
  mediaId: string;
  episodes: number | null;
  season: number | null;
  episodeTo: number | null;
  minutes: number | null;
  completed: boolean;
};

export type WatchSheetMode =
  /** Hoy: "Guardar" checks the habit in and saves the entry; "Solo marcar" only checks it in. */
  | { kind: "checkin"; habitId: string }
  /** Any day with a check-in: add, edit or delete its entry. Never touches the check-in. */
  | { kind: "edit"; checkinId: string; entry: WatchEntryValues | null };

const toInt = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);
const WATCH_LOST_HEAD = "Marcamos el hábito, pero no guardamos lo que viste.";
const WATCH_LOST = `${WATCH_LOST_HEAD} Inténtalo de nuevo.`;

export function watchTitle(mode: WatchSheetMode): string {
  if (mode.kind === "checkin") return "¿Qué viste hoy?";
  return mode.entry ? "Editar registro" : "Añadir registro";
}

export function WatchSheet({
  open,
  onClose,
  mode,
  media,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mode: WatchSheetMode;
  media: PickerMedia[];
  onSaved?: (message: string) => void;
}) {
  return (
    <Sheet open={open} title={watchTitle(mode)} onClose={onClose} tall>
      <WatchForm mode={mode} media={media} onFinished={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

/**
 * Title chips, then by kind: episodes (stepper), season, "hasta el ep." and minutes, with
 * "Terminé la serie"; or "La vi completa" with the runtime, or the minutes watched. Check-in mode:
 * Guardar / Solo marcar. Edit mode: Guardar / Borrar registro.
 */
export function WatchForm({
  mode,
  media: initialMedia,
  onFinished,
  onSaved,
}: {
  mode: WatchSheetMode;
  media: PickerMedia[];
  onFinished: () => void;
  onSaved?: (message: string) => void;
}) {
  const router = useRouter();
  const editing = mode.kind === "edit";
  const existing = mode.kind === "edit" ? mode.entry : null;
  const [media, setMedia] = useState(initialMedia);
  const [mediaId, setMediaId] = useState<string | null>(existing?.mediaId ?? initialMedia[0]?.id ?? null);
  const item = media.find((m) => m.id === mediaId) ?? null;
  const [episodes, setEpisodes] = useState(existing?.episodes ? String(existing.episodes) : "1");
  // null = untouched: the field shows the suggestion from the title's latest entry
  const [season, setSeason] = useState<string | null>(existing ? (existing.season === null ? "" : String(existing.season)) : null);
  const [episodeTo, setEpisodeTo] = useState<string | null>(
    existing ? (existing.episodeTo === null ? "" : String(existing.episodeTo)) : null,
  );
  const [minutes, setMinutes] = useState(existing?.minutes ? String(existing.minutes) : "");
  const [completed, setCompleted] = useState(existing?.completed ?? false);
  const [finished, setFinished] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Hoy's check-in sheet: no celebration may open on top of it (one sheet at a time).
  const holdsHoy = mode.kind === "checkin";
  useEffect(() => (holdsHoy ? holdCelebrations() : undefined), [holdsHoy]);

  const isMovie = item?.kind === "movie";
  const episodesN = toInt(episodes);
  const suggestedSeason = item?.hintSeason != null ? String(item.hintSeason) : "";
  const suggestedTo =
    item?.hintEpisodeTo != null && episodesN !== null ? String(item.hintEpisodeTo + episodesN) : "";
  const seasonShown = season ?? suggestedSeason;
  const toShown = episodeTo ?? suggestedTo;

  function pick(id: string) {
    setMediaId(id);
    setSeason(null);
    setEpisodeTo(null);
    setMinutes("");
    setCompleted(false);
    setFinished(false);
    setError(null);
  }

  function step(delta: number) {
    const next = Math.min(200, Math.max(1, (episodesN ?? 1) + delta));
    setEpisodes(String(next));
  }

  function entryOrError(): { error: string } | { entry: WatchInput } {
    if (!item) return { error: "Elige un título o agrega uno nuevo." };
    const optional = (s: string) => (s.trim() === "" ? null : toInt(s));
    const raw = isMovie
      ? { episodes: null, season: null, episodeTo: null, minutes: completed ? null : optional(minutes), completed }
      : {
          episodes: episodesN,
          season: optional(seasonShown),
          episodeTo: optional(toShown),
          minutes: optional(minutes),
          completed: false,
        };
    const numbers = isMovie ? [minutes] : [seasonShown, toShown, minutes];
    if ((!isMovie && episodesN === null) || numbers.some((s) => s.trim() !== "" && toInt(s) === null)) {
      return { error: "Escribe números enteros." };
    }
    const valid = validateWatchInput(
      item.kind,
      raw,
      {
        id: item.id,
        title: item.title,
        kind: item.kind,
        totalSeasons: item.totalSeasons,
        totalEpisodes: item.totalEpisodes,
        runtimeMin: item.runtimeMin,
        status: "watching",
        finishedOn: null,
      },
    );
    if (!valid.ok) return { error: valid.error };
    return { entry: { mediaId: item.id, ...raw, finished: isMovie ? false : finished } };
  }

  function save() {
    const r = entryOrError();
    if (!("entry" in r)) return setError(r.error);
    const entry = r.entry;
    setError(null);
    start(async () => {
      if (mode.kind === "checkin") {
        const res = await checkInWithWatch(mode.habitId, entry);
        if (!res.ok) {
          setError(res.checkedIn && res.error !== WATCH_LOST ? `${WATCH_LOST_HEAD} ${res.error}` : res.error);
          if (res.checkedIn) router.refresh();
          return;
        }
        onFinished();
        onSaved?.("Registro guardado");
        router.refresh();
        return;
      }
      const res = await saveWatch(mode.checkinId, entry);
      if (!res.ok) return setError(res.error);
      onFinished();
      onSaved?.("Registro guardado");
      router.refresh();
    });
  }

  function skip() {
    if (mode.kind !== "checkin") return;
    setError(null);
    start(async () => {
      const res = await checkInWithWatch(mode.habitId, null);
      if (!res.ok) return setError(res.error);
      onFinished();
      router.refresh();
    });
  }

  function remove() {
    if (mode.kind !== "edit") return;
    start(async () => {
      const res = await deleteWatch(mode.checkinId);
      if (!res.ok) return setError(res.error);
      onFinished();
      onSaved?.("Registro borrado");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-1">
      {!editing ? <p className="text-small text-muted">Anota el título y lo que viste.</p> : null}
      <MediaPicker
        media={media}
        value={mediaId}
        onChange={pick}
        onCreated={(m) => {
          setMedia((list) => [m, ...list]);
          pick(m.id);
        }}
      />
      {item && !isMovie ? (
        <>
          <div className="flex items-end gap-2">
            <IconButton label="Un episodio menos" className="border border-outline-strong" onClick={() => step(-1)}>
              <Minus size={20} weight="light" aria-hidden />
            </IconButton>
            <Input
              label="Episodios vistos"
              name="episodes"
              inputMode="numeric"
              value={episodes}
              className="font-mono"
              onChange={(e) => setEpisodes(e.target.value)}
            />
            <IconButton label="Un episodio más" className="border border-outline-strong" onClick={() => step(1)}>
              <Plus size={20} weight="light" aria-hidden />
            </IconButton>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Temporada (opcional)"
              name="season"
              inputMode="numeric"
              value={seasonShown}
              className="font-mono"
              onChange={(e) => setSeason(e.target.value)}
            />
            <Input
              label="Hasta el episodio (opcional)"
              name="episode-to"
              inputMode="numeric"
              value={toShown}
              className="font-mono"
              onChange={(e) => setEpisodeTo(e.target.value)}
            />
          </div>
          <Input
            label="Minutos (opcional)"
            name="minutes"
            inputMode="numeric"
            value={minutes}
            className="font-mono"
            onChange={(e) => setMinutes(e.target.value)}
          />
          <Checkbox label="Terminé la serie" checked={finished} onChange={(e) => setFinished(e.target.checked)} />
        </>
      ) : null}
      {item && isMovie ? (
        <>
          <Checkbox
            label={
              <>
                La vi completa
                {item.runtimeMin ? <span className="font-mono text-muted"> · {formatDuration(item.runtimeMin)}</span> : null}
              </>
            }
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
          />
          {!completed ? (
            <Input
              label="Minutos vistos"
              name="minutes"
              inputMode="numeric"
              value={minutes}
              className="font-mono"
              onChange={(e) => setMinutes(e.target.value)}
            />
          ) : null}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-small text-pretty text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button onClick={save} disabled={pending}>
        Guardar
      </Button>
      {mode.kind === "checkin" ? (
        <Button variant="secondary" onClick={skip} disabled={pending}>
          Solo marcar
        </Button>
      ) : existing ? (
        confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-md bg-field p-3">
            <p className="text-small text-ink">Se borrará el registro de este día. Tu check-in no cambia.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button onClick={remove} disabled={pending}>
                Borrar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={pending}>
            Borrar registro
          </Button>
        )
      ) : null}
    </div>
  );
}
