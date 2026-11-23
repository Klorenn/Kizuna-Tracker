import { HabitIcon } from "@/components/habit-icon";
import type { IconKey } from "@/domain/presets";
import { CREATE_NEW } from "@/lib/challenge-accept";

export type AcceptHabit = { id: string; name: string; requiresPhoto: boolean };

/** Icon before the habit, the existing summary after it, and one extra line: kind of record · Con foto. */
export function ProposalHabitLines({
  icon,
  name,
  summary,
  kind,
  requiresPhoto,
}: {
  icon: IconKey;
  name: string;
  summary: string;
  kind: string;
  requiresPhoto: boolean;
}) {
  return (
    <>
      <p className="flex items-center gap-[6px] text-small text-muted">
        <span className="flex shrink-0 text-ink">
          <HabitIcon name={icon} size={16} />
        </span>
        <span className="min-w-0 truncate">
          {name} · {summary}
        </span>
      </p>
      <p className="text-small text-muted">
        {kind}
        {requiresPhoto ? " · Con foto" : ""}
      </p>
    </>
  );
}

function Radio({
  selected,
  onSelect,
  title,
  note,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  note?: string[];
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex min-h-11 items-center gap-3 py-2 text-left"
    >
      <span
        aria-hidden
        className={`flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
          selected ? "border-accent" : "border-outline-strong"
        }`}
      >
        {selected ? <span className="size-[10px] rounded-full bg-accent" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className={`text-body text-ink ${selected ? "font-medium" : ""}`}>{title}</span>
        {note?.map((line) => (
          <span key={line} className="text-small text-muted">
            {line}
          </span>
        ))}
      </span>
    </button>
  );
}

/** Body of "Elige tu hábito": "Crear «…»" first (unless a same-name habit exists), then "Mis hábitos". */
export function AcceptOptions({
  otherName,
  proposedName,
  createSubline,
  createSimple,
  habits,
  canCreate,
  selected,
  onSelect,
}: {
  otherName: string;
  proposedName: string;
  createSubline: string;
  createSimple: boolean;
  habits: AcceptHabit[];
  canCreate: boolean;
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <>
      <p className="text-body text-muted">
        {otherName} compite con «{proposedName}». Elige con cuál participas tú.
      </p>
      <div role="radiogroup" aria-label="Tu hábito" className="flex flex-col rounded-lg border border-line px-4">
        {canCreate ? (
          <Radio
            selected={selected === CREATE_NEW}
            onSelect={() => onSelect(CREATE_NEW)}
            title={`Crear «${proposedName}»`}
            note={createSimple ? [createSubline, "Se creará como hábito de solo marcar."] : [createSubline]}
          />
        ) : null}
        {habits.length > 0 ? (
          <>
            <p className={`section-label flex h-6 items-center text-muted ${canCreate ? "border-t border-line pt-3" : "pt-3"}`}>
              Mis hábitos
            </p>
            {habits.map((h) => (
              <Radio key={h.id} selected={selected === h.id} onSelect={() => onSelect(h.id)} title={h.name} />
            ))}
          </>
        ) : null}
      </div>
    </>
  );
}
