"use client";

import { CaretRight, LockSimple, PencilSimple, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { BodyEntryList, type BodyEntry } from "@/components/profile/BodyEntryList";
import { BodyHeightSheet } from "@/components/profile/BodyHeightSheet";
import { BodyWeightSheet } from "@/components/profile/BodyWeightSheet";
import { entryDateLabel } from "@/components/profile/body-view";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCm, formatKg1 } from "@/domain/body";
import type { LocalDate } from "@/domain/types";

/**
 * Private "Cuerpo" card on Perfil: latest weight, height and the last entries. Solo tú: this
 * data is only ever loaded for the signed-in owner and never rendered anywhere else.
 */
export function BodyCard({
  entries,
  height,
  today,
}: {
  /** The last entries, newest first (the first one is the latest weight). */
  entries: BodyEntry[];
  height: number | null;
  today: LocalDate;
}) {
  const [weightOpen, setWeightOpen] = useState(false);
  const [heightOpen, setHeightOpen] = useState(false);
  const latest = entries[0] ?? null;

  return (
    <section aria-labelledby="perfil-cuerpo" className="flex flex-col gap-2">
      <h2 id="perfil-cuerpo" className="section-label flex h-6 items-center gap-2 text-muted">
        <span className="flex-1">Cuerpo</span>
        <span className="inline-flex items-center gap-1">
          <LockSimple size={14} weight="light" aria-hidden />
          Solo tú
        </span>
      </h2>
      <Card>
        <div className="grid grid-cols-2 divide-x divide-line">
          <div className="flex min-w-0 flex-col gap-1.5 p-4">
            <p className="text-small text-muted">Peso</p>
            {latest ? (
              <>
                <p className="font-mono text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">
                  {formatKg1(latest.kg)}
                </p>
                <p className="text-small text-muted">{entryDateLabel(latest.date, today)}</p>
              </>
            ) : (
              <p className="text-body text-muted">Aún no registras tu peso.</p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 p-4">
            <p className="text-small text-muted">Altura</p>
            <p className="font-mono text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">
              {height === null ? "—" : formatCm(height)}
            </p>
            <button
              type="button"
              onClick={() => setHeightOpen(true)}
              className="-mb-2.5 -ml-1 inline-flex h-11 w-fit items-center gap-1 px-1 text-small font-medium text-accent"
            >
              <PencilSimple size={16} weight="light" aria-hidden />
              Editar altura
            </button>
          </div>
        </div>

        <div className="border-t border-line p-4">
          <Button onClick={() => setWeightOpen(true)}>
            <Plus size={20} weight="light" aria-hidden />
            Registrar peso
          </Button>
        </div>

        {entries.length > 0 ? (
          <>
            <div className="border-t border-line">
              <BodyEntryList entries={entries} today={today} />
            </div>
            <Link
              href="/resumen/peso"
              className="flex min-h-[52px] items-center gap-3 border-t border-line px-4 py-2 transition-colors duration-[120ms] hover:bg-field focus-visible:outline-offset-[-2px]"
            >
              <span className="flex-1 text-body text-accent">Ver evolución</span>
              <CaretRight size={18} weight="light" aria-hidden className="-mr-1 shrink-0 text-muted" />
            </Link>
          </>
        ) : null}
      </Card>

      <BodyWeightSheet open={weightOpen} today={today} onClose={() => setWeightOpen(false)} />
      <BodyHeightSheet open={heightOpen} current={height} onClose={() => setHeightOpen(false)} />
    </section>
  );
}
