"use client";

import { Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  addCardio,
  checkInWithCardio,
  lastCardio,
  updateCardio,
  type CardioInput,
} from "@/app/(app)/registros/cardio-actions";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import {
  CARDIO_KINDS,
  CARDIO_KIND_LABEL,
  CARDIO_QUESTION,
  formatPace,
  paceSeconds,
  parseDistance,
  parseHms,
  speedKmh,
  type CardioKind,
} from "@/domain/cardio";
import { holdCelebrations } from "@/lib/celebration-bus";
import { cardioDistanceError, cardioTimeError, repeatedMessage } from "@/lib/cardio-form";
import { radioKeyTarget } from "@/lib/radio-keys";

/**
 * "¿Cuánto trotaste hoy?" as a sheet. Self-contained: plain props only. Render it only while open
 * (the form starts from its props each time); the close button never checks anything.
 *
 * Props:
 * - `open`, `onClose`: visibility.
 * - `habitId`: the habit ("Repetir el último" reads its latest outing).
 * - `mode`:
 *   - `{ kind: "checkin" }`: Hoy. "Guardar" checks the habit in and adds the outing; "Solo marcar" only
 *     checks it in.
 *   - `{ kind: "add", checkinId }`: one more outing on a day that already has a check-in ("+ Salida").
 *   - `{ kind: "edit", entryId, entry }`: change one outing.
 * - `defaultKind`: activity chip selected first (default `run`; "Trotar" habits).
 * - `onSaved(message)`: after a save, with the toast text.
 */
export type CardioSheetMode =
  | { kind: "checkin" }
  | { kind: "add"; checkinId: string }
  | { kind: "edit"; entryId: string; entry: CardioInput };

export function cardioTitle(mode: CardioSheetMode, kind: CardioKind): string {
  return mode.kind === "edit" ? "Editar salida" : CARDIO_QUESTION[kind];
}

export function CardioSheet({
  open,
  onClose,
  habitId,
  mode,
  defaultKind = "run",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  habitId: string;
  mode: CardioSheetMode;
  defaultKind?: CardioKind;
  onSaved?: (message: string) => void;
}) {
  // the title follows the chosen activity ("¿Cuánto caminaste hoy?"), so the form reports it
  const [kind, setKind] = useState<CardioKind>(mode.kind === "edit" ? mode.entry.kind : defaultKind);
  return (
    <Sheet open={open} title={cardioTitle(mode, kind)} onClose={onClose} tall>
      <CardioForm
        mode={mode}
        habitId={habitId}
        kind={kind}
        onKind={setKind}
        onFinished={onClose}
        onSaved={onSaved}
      />
    </Sheet>
  );
}

/** Distance as the field shows it: metres for swimming, kilometres (comma) otherwise. */
function distanceText(m: number, kind: CardioKind): string {
  return kind === "swim" ? String(m) : String(m / 1000).replace(".", ",");
}

function hmsParts(total: number): [string, string, string] {
  return [String(Math.floor(total / 3600)), String(Math.floor((total % 3600) / 60)), String(total % 60)];
}

/** Pace and speed under the time fields. The announced text lags so a screen reader is not spammed per keystroke. */
function LivePace({ text }: { text: string }) {
  const [announced, setAnnounced] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(text), 600);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <p aria-live="polite" className="min-h-6 font-mono text-body font-medium text-ink">
      {announced}
    </p>
  );
}

const EFFORTS = [1, 2, 3, 4, 5] as const;

/**
 * Activity chips, distance, h/min/s with live pace, effort 1–5, note. Check-in mode: Guardar /
 * Solo marcar; add and edit: Guardar. `onFinished` runs after a successful save or skip.
 */
export function CardioForm({
  mode,
  habitId,
  kind,
  onKind,
  onFinished,
  onSaved,
}: {
  mode: CardioSheetMode;
  habitId: string;
  kind: CardioKind;
  onKind: (k: CardioKind) => void;
  onFinished: () => void;
  onSaved?: (message: string) => void;
}) {
  const router = useRouter();
  // one id per form: two forms on a page never share the error id
  const timeErrorId = useId();
  const existing = mode.kind === "edit" ? mode.entry : null;
  const [distance, setDistance] = useState(existing ? distanceText(existing.distanceM, existing.kind) : "");
  const initialHms = existing ? hmsParts(existing.durationS) : (["", "", ""] as const);
  const [h, setH] = useState(initialHms[0]);
  const [m, setM] = useState(initialHms[1]);
  const [s, setS] = useState(initialHms[2]);
  const [effort, setEffort] = useState<number | null>(existing?.effort ?? null);
  const [note, setNote] = useState(existing?.note ?? "");
  const [errors, setErrors] = useState<{ distance?: string; time?: string; form?: string }>({});
  // what "Repetir el último" copied, announced once
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const effortRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Hoy's check-in sheet: no celebration may open on top of it (one sheet at a time)
  const holdsHoy = mode.kind === "checkin";
  useEffect(() => (holdsHoy ? holdCelebrations() : undefined), [holdsHoy]);

  const swim = kind === "swim";
  const distanceM = parseDistance(distance, kind);
  const durationS = parseHms(h, m, s);
  const live =
    distanceM !== null && durationS !== null
      ? swim
        ? "—"
        : `${formatPace(paceSeconds(distanceM, durationS))} · ${speedKmh(distanceM, durationS).toFixed(1).replace(".", ",")} km/h`
      : "—";

  function pickKind(next: CardioKind) {
    // metres and kilometres do not convert silently: switching units clears the distance
    if (next === kind) return;
    if ((next === "swim") !== swim) setDistance("");
    onKind(next);
    setErrors({});
    setStatus(null);
  }

  function entryOrErrors(): { entry: CardioInput } | { errors: typeof errors } {
    const next: typeof errors = {};
    if (distanceM === null) next.distance = cardioDistanceError(distance, kind) ?? undefined;
    if (durationS === null) next.time = cardioTimeError(h, m, s) ?? undefined;
    if (next.distance || next.time || distanceM === null || durationS === null) return { errors: next };
    return { entry: { kind, distanceM, durationS, effort, note: note.trim() === "" ? null : note.trim() } };
  }

  function save() {
    const r = entryOrErrors();
    if (!("entry" in r)) return setErrors(r.errors);
    const entry = r.entry;
    setErrors({});
    start(async () => {
      if (mode.kind === "checkin") {
        const res = await checkInWithCardio(habitId, entry);
        if (!res.ok) {
          setErrors({ form: res.error });
          if (res.checkedIn) router.refresh();
          return;
        }
        onFinished();
        onSaved?.("Salida guardada");
        router.refresh();
        return;
      }
      const res = mode.kind === "add" ? await addCardio(mode.checkinId, entry) : await updateCardio(mode.entryId, entry);
      if (!res.ok) return setErrors({ form: res.error });
      onFinished();
      onSaved?.(mode.kind === "add" ? "Salida guardada" : "Salida actualizada");
      // re-read the day: the row on screen always comes from the database
      router.refresh();
    });
  }

  function skip() {
    if (mode.kind !== "checkin") return;
    setErrors({});
    start(async () => {
      const res = await checkInWithCardio(habitId, null);
      if (!res.ok) return setErrors({ form: res.error });
      onFinished();
      router.refresh();
    });
  }

  function repeatLast() {
    setErrors({});
    setStatus(null);
    start(async () => {
      const last = await lastCardio(habitId);
      if (!last) return setErrors({ form: "Aún no tienes salidas para repetir." });
      onKind(last.kind);
      setDistance(distanceText(last.distanceM, last.kind));
      [setH, setM, setS].forEach((set, i) => set(hmsParts(last.durationS)[i]));
      setEffort(last.effort);
      setNote(last.note ?? "");
      setStatus(repeatedMessage(last));
    });
  }

  function onEffortKey(e: React.KeyboardEvent, index: number) {
    const to = radioKeyTarget(e.key, index, EFFORTS.length);
    if (to === null) return;
    e.preventDefault();
    setEffort(EFFORTS[to]);
    effortRefs.current[to]?.focus();
  }

  const timeInvalid = Boolean(errors.time);
  // the one time message describes all three time fields
  const timeDescribedBy = timeInvalid ? timeErrorId : undefined;
  return (
    <div className="flex flex-col gap-4 pb-1">
      <div role="group" aria-label="Actividad" className="flex flex-wrap gap-2">
        {CARDIO_KINDS.map((k) => (
          <Chip key={k} selected={k === kind} onClick={() => pickKind(k)}>
            {CARDIO_KIND_LABEL[k]}
          </Chip>
        ))}
      </div>
      <Input
        label="Distancia"
        name="distance"
        inputMode={swim ? "numeric" : "decimal"}
        autoComplete="off"
        value={distance}
        className="font-mono"
        trailing={<span className="select-none font-mono text-body text-muted">{swim ? "m" : "km"}</span>}
        error={errors.distance}
        onChange={(e) => setDistance(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-3">
          <Input label="Horas" name="hours" inputMode="numeric" autoComplete="off" value={h} className="font-mono" invalid={timeInvalid} aria-describedby={timeDescribedBy} onChange={(e) => setH(e.target.value)} />
          <Input label="Minutos" name="minutes" inputMode="numeric" autoComplete="off" value={m} className="font-mono" invalid={timeInvalid} aria-describedby={timeDescribedBy} onChange={(e) => setM(e.target.value)} />
          <Input label="Segundos" name="seconds" inputMode="numeric" autoComplete="off" value={s} className="font-mono" invalid={timeInvalid} aria-describedby={timeDescribedBy} onChange={(e) => setS(e.target.value)} />
        </div>
        {errors.time ? (
          <p id={timeErrorId} role="alert" className="flex items-start gap-[6px] text-small text-pretty text-ink">
            <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
            {errors.time}
          </p>
        ) : null}
      </div>
      <LivePace text={live} />
      <div className="flex flex-col gap-2">
        <span id="cardio-effort" className="text-small text-ink">
          Esfuerzo (opcional)
        </span>
        <div role="radiogroup" aria-labelledby="cardio-effort" className="flex gap-2">
          {EFFORTS.map((n, i) => {
            const selected = effort === n;
            return (
              <button
                key={n}
                ref={(el) => {
                  effortRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (effort === null && i === 0) ? 0 : -1}
                onClick={() => setEffort(selected ? null : n)}
                onKeyDown={(e) => onEffortKey(e, i)}
                className={`size-11 rounded-full font-mono text-body font-medium transition-colors duration-[120ms] ${
                  selected ? "border-[1.5px] border-accent bg-accent-soft text-accent" : "bg-field text-ink"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <Input
        label="Nota (opcional)"
        name="note"
        maxLength={60}
        autoComplete="off"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {mode.kind !== "edit" ? (
        <Button variant="secondary" onClick={repeatLast} disabled={pending}>
          Repetir el último
        </Button>
      ) : null}
      {status ? (
        <p role="status" className="text-small text-pretty text-muted">
          {status}
        </p>
      ) : null}
      {errors.form ? (
        <p role="alert" className="flex items-start gap-1 text-small text-pretty text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {errors.form}
        </p>
      ) : null}
      <Button onClick={save} disabled={pending}>
        Guardar
      </Button>
      {mode.kind === "checkin" ? (
        <Button variant="secondary" onClick={skip} disabled={pending}>
          Solo marcar
        </Button>
      ) : null}
    </div>
  );
}
