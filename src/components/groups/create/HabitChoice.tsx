"use client";

import type { GroupHabitChoice } from "@/lib/groups-contract";

function Radio({
  selected,
  onSelect,
  title,
  note,
  nested = false,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  note?: string;
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-11 w-full items-center gap-3 py-2 text-left ${nested ? "pl-8" : ""}`}
    >
      <span
        aria-hidden
        className={`flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
          selected ? "border-accent" : "border-outline-strong"
        }`}
      >
        {selected ? <span className="size-2.5 rounded-full bg-accent" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-body text-ink ${selected ? "font-medium" : ""}`}>{title}</span>
        {note ? <span className="text-small text-muted">{note}</span> : null}
      </span>
    </button>
  );
}

/**
 * "Tu hábito para este grupo": "Crear «<compromiso>»" (the default) or "Usar uno de mis hábitos",
 * which lists `habits`. Without habits only "Crear" is offered. Same pattern as the challenge accept sheet.
 * Props: { commitmentName, habits, value, onChange }.
 */
export function HabitChoice({
  commitmentName,
  habits,
  value,
  onChange,
}: {
  commitmentName: string;
  habits: { id: string; name: string }[];
  value: GroupHabitChoice;
  onChange: (v: GroupHabitChoice) => void;
}) {
  const own = value.kind === "habit";
  const shown = commitmentName.trim() || "el compromiso";
  return (
    <div role="radiogroup" aria-label="Tu hábito para este grupo" className="flex flex-col rounded-lg border border-line px-4">
      <Radio
        selected={!own}
        onSelect={() => onChange({ kind: "create" })}
        title={`Crear «${shown}»`}
        note="Se crea un hábito nuevo con el compromiso del grupo."
      />
      {habits.length > 0 ? (
        <>
          <div className="border-t border-line" />
          <Radio
            selected={own}
            onSelect={() => onChange({ kind: "habit", habitId: own ? value.habitId : "" })}
            title="Usar uno de mis hábitos"
          />
          {own
            ? habits.map((h) => (
                <Radio
                  key={h.id}
                  nested
                  selected={value.habitId === h.id}
                  onSelect={() => onChange({ kind: "habit", habitId: h.id })}
                  title={h.name}
                />
              ))
            : null}
        </>
      ) : null}
    </div>
  );
}
