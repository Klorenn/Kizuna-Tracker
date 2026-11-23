"use client";

import { Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createMedia, deleteMedia, setMediaFinished, updateMedia } from "@/app/(app)/registros/watch-actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import type { LocalDate } from "@/domain/types";
import { MAX_MEDIA_TITLE, type MediaKind } from "@/domain/watch";
import { mediaDeleteCopy } from "./media-data";
import type { MediaView } from "./SeriesView";

const toInt = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="flex items-start gap-1 text-small text-pretty text-ink">
      <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
      {error}
    </p>
  ) : null;
}

export function MediaFormSheet({
  item,
  onClose,
  onDone,
  onFinish,
  onDelete,
}: {
  item?: MediaView;
  onClose: () => void;
  onDone: (message: string) => void;
  onFinish?: () => void;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? "");
  const [kind, setKind] = useState<MediaKind>(item?.kind ?? "series");
  const [seasons, setSeasons] = useState(item?.totalSeasons ? String(item.totalSeasons) : "");
  const [episodes, setEpisodes] = useState(item?.totalEpisodes ? String(item.totalEpisodes) : "");
  const [runtime, setRuntime] = useState(item?.runtimeMin ? String(item.runtimeMin) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    const fields = kind === "movie" ? [runtime] : [seasons, episodes];
    if (fields.some((f) => f.trim() !== "" && toInt(f) === null)) return setError("Escribe números enteros.");
    const input =
      kind === "movie"
        ? { title, totalSeasons: null, totalEpisodes: null, runtimeMin: toInt(runtime) }
        : { title, totalSeasons: toInt(seasons), totalEpisodes: toInt(episodes), runtimeMin: null };
    setError(null);
    start(async () => {
      const r = item ? await updateMedia(item.id, input) : await createMedia({ ...input, kind });
      if (!r.ok) return setError(r.error);
      onDone(item ? "Título guardado" : "Título agregado");
      router.refresh();
    });
  }

  function backToWatching() {
    if (!item) return;
    start(async () => {
      const r = await setMediaFinished(item.id, null);
      if (!r.ok) return setError(r.error);
      onDone("Volvió a Viendo");
      router.refresh();
    });
  }

  return (
    <Sheet open title={item ? "Editar título" : "Nuevo título"} onClose={onClose} tall>
      <div className="flex flex-col gap-4 pb-1">
        <Input label="Título" name="title" value={title} maxLength={MAX_MEDIA_TITLE} onChange={(e) => setTitle(e.target.value)} />
        {item ? null : (
          <Segmented
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={[
              { value: "series", label: "Serie" },
              { value: "movie", label: "Película" },
            ]}
          />
        )}
        {kind === "series" ? (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Temporadas (opcional)"
              name="seasons"
              inputMode="numeric"
              className="font-mono"
              value={seasons}
              onChange={(e) => setSeasons(e.target.value)}
            />
            <Input
              label="Episodios totales (opcional)"
              name="episodes"
              inputMode="numeric"
              className="font-mono"
              value={episodes}
              onChange={(e) => setEpisodes(e.target.value)}
            />
          </div>
        ) : (
          <Input
            label="Duración en minutos (opcional)"
            name="runtime"
            inputMode="numeric"
            className="font-mono"
            value={runtime}
            onChange={(e) => setRuntime(e.target.value)}
          />
        )}
        <ErrorLine error={error} />
        <Button onClick={save} disabled={pending}>
          Guardar
        </Button>
        {item ? (
          <>
            {item.status === "watching" ? (
              <Button variant="secondary" onClick={onFinish} disabled={pending}>
                Marcar terminada
              </Button>
            ) : (
              <Button variant="secondary" onClick={backToWatching} disabled={pending}>
                Volver a Viendo
              </Button>
            )}
            <Button variant="ghost" onClick={onDelete} disabled={pending}>
              Borrar título
            </Button>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

export function FinishSheet({
  item,
  today,
  onClose,
  onDone,
}: {
  item: MediaView;
  today: LocalDate;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState<string>(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (date > today) return setError("La fecha no puede ser futura.");
    setError(null);
    start(async () => {
      const r = await setMediaFinished(item.id, date as LocalDate);
      if (!r.ok) return setError(r.error);
      onDone(`Terminaste ${item.title}`);
      router.refresh();
    });
  }

  return (
    <Sheet open title="Marcar terminada" onClose={onClose}>
      <p className="text-body text-muted">{item.title}</p>
      <Input
        label="La terminaste el"
        name="finished-on"
        type="date"
        max={today}
        value={date}
        className="font-mono"
        onChange={(e) => setDate(e.target.value)}
      />
      <ErrorLine error={error} />
      <Button onClick={save} disabled={pending || date === ""}>
        Marcar terminada
      </Button>
    </Sheet>
  );
}

export function DeleteSheet({ item, onClose, onDone }: { item: MediaView; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove() {
    start(async () => {
      const r = await deleteMedia(item.id);
      if (!r.ok) return setError(r.error);
      onDone("Título borrado");
      router.refresh();
    });
  }

  return (
    <Sheet open title={`¿Borrar ${item.title}?`} onClose={onClose}>
      <p className="text-body text-muted">{mediaDeleteCopy(item.records, item.episodes, item.minutes)}</p>
      <ErrorLine error={error} />
      <Button onClick={remove} disabled={pending}>
        Borrar
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
    </Sheet>
  );
}
