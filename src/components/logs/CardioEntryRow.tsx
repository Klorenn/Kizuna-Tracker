import { PencilSimple, Trash } from "@phosphor-icons/react/dist/ssr";
import { CARDIO_KIND_LABEL, formatDistance, formatPace, paceSeconds, type CardioKind } from "@/domain/cardio";
import { formatHms } from "@/domain/time";
import { IconButton } from "@/components/ui/IconButton";

/**
 * One outing of a day: "Trote · 5,2 km · 29:40 · 5:42 /km" (swimming has no pace per km), with
 * the effort and note under it. Props: the outing plus `onEdit` / `onDelete` (both optional: without
 * them the row is read-only).
 */
export type CardioRowEntry = {
  id: string;
  kind: CardioKind;
  distanceM: number;
  durationS: number;
  effort: number | null;
  note: string | null;
};

export function cardioRowText(e: Pick<CardioRowEntry, "kind" | "distanceM" | "durationS">): string {
  const parts = [CARDIO_KIND_LABEL[e.kind], formatDistance(e.distanceM, e.kind), formatHms(e.durationS)];
  if (e.kind !== "swim") parts.push(formatPace(paceSeconds(e.distanceM, e.durationS)));
  return parts.join(" · ");
}

export function CardioEntryRow({
  entry,
  onEdit,
  onDelete,
  disabled = false,
}: {
  entry: CardioRowEntry;
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  const detail = [entry.effort !== null ? `Esfuerzo ${entry.effort} de 5` : null, entry.note].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-2 py-1">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-body text-ink">{cardioRowText(entry)}</p>
        {detail ? <p className="truncate text-small text-muted">{detail}</p> : null}
      </div>
      {onEdit ? (
        <IconButton label="Editar salida" onClick={onEdit} disabled={disabled}>
          <PencilSimple size={20} weight="light" aria-hidden />
        </IconButton>
      ) : null}
      {onDelete ? (
        <IconButton label="Borrar salida" onClick={onDelete} disabled={disabled}>
          <Trash size={20} weight="light" aria-hidden />
        </IconButton>
      ) : null}
    </li>
  );
}
