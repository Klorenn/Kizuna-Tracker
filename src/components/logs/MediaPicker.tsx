"use client";

import { Plus, Warning } from "@phosphor-icons/react/dist/ssr";
import { useState, useTransition } from "react";
import { createMedia } from "@/app/(app)/registros/watch-actions";
import type { PickerMedia } from "@/app/(app)/series/media-data";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { MAX_MEDIA_TITLE, type MediaKind } from "@/domain/watch";

const toInt = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

/**
 * Chips of the titles you are watching (last used first) plus "Nuevo título", which opens an inline
 * form: title, Serie / Película and, by kind, optional seasons and episodes or the runtime. With no
 * titles the form starts open.
 */
export function MediaPicker({
  media,
  value,
  onChange,
  onCreated,
}: {
  media: PickerMedia[];
  value: string | null;
  onChange: (id: string) => void;
  onCreated: (item: PickerMedia) => void;
}) {
  const [adding, setAdding] = useState(media.length === 0);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<MediaKind>("series");
  const [seasons, setSeasons] = useState("");
  const [episodes, setEpisodes] = useState("");
  const [runtime, setRuntime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    const fields = kind === "movie" ? [runtime] : [seasons, episodes];
    if (fields.some((f) => f.trim() !== "" && toInt(f) === null)) return setError("Escribe números enteros.");
    const input =
      kind === "movie"
        ? { title, kind, totalSeasons: null, totalEpisodes: null, runtimeMin: toInt(runtime) }
        : { title, kind, totalSeasons: toInt(seasons), totalEpisodes: toInt(episodes), runtimeMin: null };
    setError(null);
    start(async () => {
      const r = await createMedia(input);
      if (!r.ok) return setError(r.error);
      onCreated({
        id: r.id,
        title: title.trim(),
        kind,
        totalSeasons: input.totalSeasons,
        totalEpisodes: input.totalEpisodes,
        runtimeMin: input.runtimeMin,
        hintSeason: null,
        hintEpisodeTo: null,
      });
      setTitle("");
      setSeasons("");
      setEpisodes("");
      setRuntime("");
      setAdding(false);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p id="media-picker-label" className="section-label text-muted">
        TÍTULO
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="media-picker-label">
        {media.map((m) => (
          <Chip key={m.id} selected={m.id === value} onClick={() => onChange(m.id)} className="max-w-full">
            <span className="truncate">{m.title}</span>
          </Chip>
        ))}
        <Chip
          selected={adding}
          // a toggle that opens a form: expanded state only, not also "pressed"
          aria-pressed={undefined}
          aria-expanded={adding}
          icon={<Plus size={16} weight="light" aria-hidden />}
          onClick={() => setAdding((a) => !a)}
        >
          Nuevo título
        </Chip>
      </div>
      {adding ? (
        <div className="flex flex-col gap-3 rounded-md bg-field p-3">
          <Input
            label="Título"
            name="media-title"
            value={title}
            maxLength={MAX_MEDIA_TITLE}
            placeholder="Dark"
            onChange={(e) => setTitle(e.target.value)}
          />
          <Segmented
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={[
              { value: "series", label: "Serie" },
              { value: "movie", label: "Película" },
            ]}
          />
          {kind === "series" ? (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Temporadas (opcional)"
                name="media-seasons"
                inputMode="numeric"
                value={seasons}
                className="font-mono"
                onChange={(e) => setSeasons(e.target.value)}
              />
              <Input
                label="Episodios totales (opcional)"
                name="media-episodes"
                inputMode="numeric"
                value={episodes}
                className="font-mono"
                onChange={(e) => setEpisodes(e.target.value)}
              />
            </div>
          ) : (
            <Input
              label="Duración en minutos (opcional)"
              name="media-runtime"
              inputMode="numeric"
              value={runtime}
              className="font-mono"
              onChange={(e) => setRuntime(e.target.value)}
            />
          )}
          {error ? (
            <p role="alert" className="flex items-center gap-1 text-small text-ink">
              <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
              {error}
            </p>
          ) : null}
          <Button variant="secondary" onClick={add} disabled={pending}>
            Agregar título
          </Button>
        </div>
      ) : null}
    </div>
  );
}
