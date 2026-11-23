"use client";

import type { KeyboardEvent } from "react";
import type { GroupHabitChoice } from "@/lib/groups-contract";

/** Arrow keys move through a radiogroup and wrap; any other key is not ours (null). */
export function nextRadioIndex(key: string, index: number, count: number): number | null {
  if (key === "ArrowDown" || key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowUp" || key === "ArrowLeft") return (index - 1 + count) % count;
  return null;
}

function onRadioKeys(count: number, index: number, select: (i: number) => void) {
  return (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextRadioIndex(e.key, index, count);
    if (next === null) return;
    e.preventDefault();
    select(next);
    const radios = e.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]');
    radios?.[next]?.focus();
  };
}

function Radio({
  selected,
  tabStop,
  onSelect,
  onKeyDown,
  title,
  note,
  nested = false,
}: {
  selected: boolean;
  tabStop: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  title: string;
  note?: string;
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabStop ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
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
 * which lists `habits`. Without habits only "Crear" is offered. Two radiogroups (the mode, then the
 * habit list), each with one checked radio and one tab stop; arrow keys move the selection.
 * Props: { commitmentName, habits, value, onChange, errorId? } (errorId: the error line to describe it).
 */
export function HabitChoice({
  commitmentName,
  habits,
  value,
  onChange,
  errorId,
}: {
  commitmentName: string;
  habits: { id: string; name: string }[];
  value: GroupHabitChoice;
  onChange: (v: GroupHabitChoice) => void;
  errorId?: string;
}) {
  const ownId = value.kind === "habit" ? value.habitId : "";
  const own = value.kind === "habit";
  const shown = commitmentName.trim() || "el compromiso";
  const modes = habits.length > 0 ? 2 : 1;
  const pickMode = (i: number) => onChange(i === 0 ? { kind: "create" } : { kind: "habit", habitId: ownId });
  const pickHabit = (i: number) => onChange({ kind: "habit", habitId: habits[i].id });
  const checkedHabit = habits.findIndex((h) => h.id === ownId);
  const habitStop = checkedHabit === -1 ? 0 : checkedHabit;
  const a11y = { "aria-describedby": errorId, "aria-invalid": errorId ? true : undefined } as const;
  return (
    <div className="flex flex-col rounded-lg border border-line px-4">
      <div role="radiogroup" aria-label="Tu hábito para este grupo" {...a11y} className="flex flex-col">
        <Radio
          selected={!own}
          tabStop={!own}
          onSelect={() => pickMode(0)}
          onKeyDown={onRadioKeys(modes, 0, pickMode)}
          title={`Crear «${shown}»`}
          note="Se crea un hábito nuevo con el compromiso del grupo."
        />
        {habits.length > 0 ? (
          <>
            <div className="border-t border-line" />
            <Radio
              selected={own}
              tabStop={own}
              onSelect={() => pickMode(1)}
              onKeyDown={onRadioKeys(modes, 1, pickMode)}
              title="Usar uno de mis hábitos"
            />
          </>
        ) : null}
      </div>
      {own ? (
        <div role="radiogroup" aria-label="Tus hábitos" {...a11y} className="flex flex-col">
          {habits.map((h, i) => (
            <Radio
              key={h.id}
              nested
              selected={h.id === ownId}
              tabStop={i === habitStop}
              onSelect={() => pickHabit(i)}
              onKeyDown={onRadioKeys(habits.length, i, pickHabit)}
              title={h.name}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
