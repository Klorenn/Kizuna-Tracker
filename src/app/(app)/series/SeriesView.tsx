"use client";

import { Plus, Television } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toast, useToast } from "@/components/ui/Toast";
import type { LocalDate } from "@/domain/types";
import type { MediaItem } from "@/domain/watch";

// sheets are not visible on first paint: their code loads when one opens
const MediaFormSheet = dynamic(() => import("./SeriesSheets").then((m) => m.MediaFormSheet));
const FinishSheet = dynamic(() => import("./SeriesSheets").then((m) => m.FinishSheet));
const DeleteSheet = dynamic(() => import("./SeriesSheets").then((m) => m.DeleteSheet));

export type MediaView = MediaItem & {
  /** "3 de 26 episodios · T1 E3", "2 h 35 min" */
  summary: string;
  records: number;
  episodes: number;
  minutes: number;
};

type Panel = { kind: "new" } | { kind: "edit" | "finish" | "delete"; item: MediaView };

const shortDate = (d: LocalDate) => format(new Date(`${d}T12:00:00`), "d MMM yyyy", { locale: es });

/** VIENDO / TERMINADAS, with add, edit (the kind never changes), finish (date never in the future), back to watching and delete. */
export function SeriesView({ media, today }: { media: MediaView[]; today: LocalDate }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toast, showToast] = useToast();
  const watching = media.filter((m) => m.status === "watching");
  const finished = media
    .filter((m) => m.status === "finished")
    .sort((a, b) => ((a.finishedOn ?? "") > (b.finishedOn ?? "") ? -1 : 1));
  const close = () => setPanel(null);
  const done = (message: string) => {
    setPanel(null);
    showToast(message);
  };

  return (
    <div className="flex flex-col gap-6">
      {media.length === 0 ? (
        <Card>
          <EmptyState
            title="Todavía no tienes títulos"
            body="Agrega la serie o la película que estás viendo. Lo que viste se anota al completar tu hábito de series y películas."
            action={
              <Button className="w-auto!" onClick={() => setPanel({ kind: "new" })}>
                <Plus size={20} weight="light" aria-hidden />
                Nuevo título
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Section id="viendo" label="Viendo" empty="No estás viendo ningún título.">
            {watching.map((m) => (
              <MediaRow key={m.id} item={m} hint={m.summary} onOpen={() => setPanel({ kind: "edit", item: m })} />
            ))}
          </Section>
          <Section id="terminadas" label="Terminadas" empty="Aún no terminas ningún título.">
            {finished.map((m) => (
              <MediaRow
                key={m.id}
                item={m}
                hint={m.finishedOn ? `Terminada el ${shortDate(m.finishedOn)}` : "Terminada"}
                onOpen={() => setPanel({ kind: "edit", item: m })}
              />
            ))}
          </Section>
          <Button variant="secondary" onClick={() => setPanel({ kind: "new" })}>
            <Plus size={20} weight="light" aria-hidden />
            Nuevo título
          </Button>
        </>
      )}

      {panel?.kind === "new" ? <MediaFormSheet onClose={close} onDone={done} /> : null}
      {panel?.kind === "edit" ? (
        <MediaFormSheet
          item={panel.item}
          onClose={close}
          onDone={done}
          onFinish={() => setPanel({ kind: "finish", item: panel.item })}
          onDelete={() => setPanel({ kind: "delete", item: panel.item })}
        />
      ) : null}
      {panel?.kind === "finish" ? <FinishSheet item={panel.item} today={today} onClose={close} onDone={done} /> : null}
      {panel?.kind === "delete" ? <DeleteSheet item={panel.item} onClose={close} onDone={done} /> : null}
      <Toast message={toast} />
    </div>
  );
}

function Section({ id, label, empty, children }: { id: string; label: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="section-label text-muted">
        {label}
      </h2>
      {children.length === 0 ? (
        <p className="text-small text-muted">{empty}</p>
      ) : (
        <Card>
          <ul className="-mb-px">{children}</ul>
        </Card>
      )}
    </section>
  );
}

function MediaRow({ item, hint, onOpen }: { item: MediaView; hint: string; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[60px] w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors duration-[120ms] hover:bg-field"
      >
        <Television size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body text-ink">{item.title}</span>
          <span className="truncate font-mono text-small text-muted">{hint}</span>
        </span>
        <span className="shrink-0 text-small text-muted">{item.kind === "movie" ? "Película" : "Serie"}</span>
      </button>
    </li>
  );
}
