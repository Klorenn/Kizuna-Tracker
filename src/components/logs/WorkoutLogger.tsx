"use client";

import { ArrowCounterClockwise, Plus, Trash, Warning } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { deleteWorkout, saveWorkout } from "@/app/(app)/registros/workout-actions";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { Toast, useToast } from "@/components/ui/Toast";
import {
  MAX_EXERCISES,
  MAX_SETS_PER_EXERCISE,
  logSubtitle,
  prefillFromLast,
  validateWorkoutDraft,
  type WorkoutDraft,
} from "@/domain/logs";
import type { LocalDate } from "@/domain/types";
import {
  draftFromFields,
  fieldsFromDraft,
  nextSet,
  type FieldError,
  type SetFields,
  type WorkoutFields,
} from "@/lib/workout-form";
import { DayTypeChips } from "./DayTypeChips";
import { ExercisePicker, type ExerciseOption } from "./ExercisePicker";
import { SetRow } from "./SetRow";

const LEAVE_DELAY_MS = 1400;

function ErrorLine({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-[6px] text-small text-pretty text-ink">
      <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
      {message}
    </p>
  );
}

/**
 * The workout of one day: day types, exercises with sets (reps x kg) and save / delete.
 * `initial` is the saved workout (edit) or null (new). `history` are earlier workouts for
 * "Repetir último de ...". Saving confirms with a toast and goes back, with no animation.
 */
export function WorkoutLogger({
  checkinId,
  date,
  backHref,
  exercises: initialOptions,
  initial,
  history,
}: {
  checkinId: string;
  date: LocalDate;
  backHref: string;
  exercises: ExerciseOption[];
  initial: WorkoutDraft | null;
  history: ({ date: LocalDate } & WorkoutDraft)[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<WorkoutFields>(() =>
    initial ? fieldsFromDraft(initial) : { dayTypes: [], exercises: [] },
  );
  const [options, setOptions] = useState(initialOptions);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAt, setErrorAt] = useState<FieldError | null>(null);
  const errorId = useId();
  const idBase = useId();
  const repsId = (exerciseId: string, set: number) => `${idBase}-${exerciseId}-${set}-reps`;
  // after adding a set or an exercise, the new row's reps input takes focus (runs after the
  // picker sheet gave focus back to its opener, so this one wins)
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();

  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? "Ejercicio";
  const prefill = useMemo(
    () => (fields.dayTypes.length > 0 ? prefillFromLast(history, fields.dayTypes, date) : null),
    [history, fields.dayTypes, date],
  );
  const atMaxExercises = fields.exercises.length >= MAX_EXERCISES;

  function patchExercise(index: number, sets: SetFields[]) {
    setErrorAt(null);
    setFields((f) => ({ ...f, exercises: f.exercises.map((e, i) => (i === index ? { ...e, sets } : e)) }));
  }

  // the delayed "go back" must die with the component (a manual navigation in between wins)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  function leave() {
    leaveTimer.current = setTimeout(() => {
      if (window.history.length > 1) router.back();
      else router.replace(backHref);
      router.refresh();
    }, LEAVE_DELAY_MS);
  }

  function save() {
    setError(null);
    setErrorAt(null);
    const parsed = draftFromFields(fields);
    if (!parsed.ok) {
      setErrorAt(parsed.at);
      const ex = fields.exercises[parsed.at.exercise];
      if (ex) setFocusTarget({ id: repsId(ex.exerciseId, parsed.at.set) });
      return setError(parsed.error);
    }
    const valid = validateWorkoutDraft(parsed.draft);
    if (!valid.ok) return setError(valid.error);
    start(async () => {
      const r = await saveWorkout(checkinId, parsed.draft);
      if (!r.ok) return setError(r.error);
      setSaved(true);
      showToast("Entrenamiento guardado");
      leave();
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const r = await deleteWorkout(checkinId);
      setConfirmDelete(false);
      if (!r.ok) return setError(r.error);
      setSaved(true);
      showToast("Registro borrado");
      leave();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHeader label="Tipo de día" />
        <DayTypeChips value={fields.dayTypes} onChange={(dayTypes) => setFields((f) => ({ ...f, dayTypes }))} />
        {prefill && fields.exercises.length === 0 ? (
          <Button
            variant="secondary"
            onClick={() => setFields((f) => ({ ...f, exercises: fieldsFromDraft(prefill).exercises }))}
          >
            <ArrowCounterClockwise size={20} weight="light" aria-hidden />
            <span className="truncate">
              Repetir último de {logSubtitle({ kind: "workout", dayTypes: fields.dayTypes, exerciseCount: 0 })}
            </span>
          </Button>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader label="Ejercicios" />
        {fields.exercises.length === 0 ? (
          <p className="text-body text-muted">
            Agrega los ejercicios que hiciste. Un día de solo cardio puede ir sin ejercicios.
          </p>
        ) : null}
        {fields.exercises.map((ex, i) => {
          const name = nameOf(ex.exerciseId);
          const atMaxSets = ex.sets.length >= MAX_SETS_PER_EXERCISE;
          return (
            <div key={ex.exerciseId} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate text-body font-semibold text-ink">{name}</h3>
                <IconButton
                  label={`Quitar ${name}`}
                  className="-my-2 -mr-2"
                  onClick={() => setFields((f) => ({ ...f, exercises: f.exercises.filter((_, j) => j !== i) }))}
                >
                  <Trash size={20} weight="light" aria-hidden />
                </IconButton>
              </div>
              {ex.sets.map((s, j) => (
                <SetRow
                  key={j}
                  repsId={repsId(ex.exerciseId, j)}
                  invalid={errorAt && errorAt.exercise === i && errorAt.set === j ? errorAt.field : undefined}
                  errorId={errorId}
                  index={j + 1}
                  exerciseName={name}
                  value={s}
                  onChange={(next) => patchExercise(i, ex.sets.map((x, k) => (k === j ? next : x)))}
                  onRemove={ex.sets.length > 1 ? () => patchExercise(i, ex.sets.filter((_, k) => k !== j)) : undefined}
                />
              ))}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={atMaxSets}
                  onClick={() => {
                    patchExercise(i, [...ex.sets, nextSet(ex.sets)]);
                    setFocusTarget({ id: repsId(ex.exerciseId, ex.sets.length) });
                  }}
                  aria-label={`Agregar serie a ${name}`}
                  className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-body font-medium text-accent hover:bg-accent-soft disabled:text-muted disabled:hover:bg-transparent"
                >
                  <Plus size={20} weight="light" aria-hidden />
                  Serie
                </button>
                {atMaxSets ? (
                  <p className="text-small text-muted">Máximo {MAX_SETS_PER_EXERCISE} series por ejercicio.</p>
                ) : null}
              </div>
            </div>
          );
        })}
        <Button variant="secondary" disabled={atMaxExercises} onClick={() => setPickerOpen(true)}>
          <Plus size={20} weight="light" aria-hidden />
          Agregar ejercicio
        </Button>
        {atMaxExercises ? (
          <p className="text-small text-muted">Máximo {MAX_EXERCISES} ejercicios por entrenamiento.</p>
        ) : null}
      </section>

      {error ? <ErrorLine id={errorId} message={error} /> : null}

      <div className="flex flex-col gap-2">
        <Button onClick={save} disabled={pending || saved}>
          Guardar
        </Button>
        {initial ? (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={pending || saved}>
            Borrar registro
          </Button>
        ) : null}
      </div>

      <ExercisePicker
        open={pickerOpen}
        exercises={options}
        usedIds={fields.exercises.map((e) => e.exerciseId)}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => {
          if (!fields.exercises.some((e) => e.exerciseId === ex.id)) setFocusTarget({ id: repsId(ex.id, 0) });
          setFields((f) =>
            f.exercises.some((e) => e.exerciseId === ex.id)
              ? f
              : { ...f, exercises: [...f.exercises, { exerciseId: ex.id, sets: [nextSet([])] }] },
          );
          setPickerOpen(false);
        }}
        onCreated={(ex) => setOptions((o) => [...o, ex])}
        onRenamed={(id, name) => setOptions((o) => o.map((x) => (x.id === id ? { ...x, name } : x)))}
        onArchived={(id) => setOptions((o) => o.map((x) => (x.id === id ? { ...x, archived: true } : x)))}
      />

      <Sheet open={confirmDelete} title="¿Borrar este registro?" onClose={() => setConfirmDelete(false)}>
        <p className="text-body text-muted">Se borran los ejercicios y las series de este día. Tu check-in no cambia.</p>
        <div className="flex flex-col gap-2">
          <Button onClick={remove} disabled={pending}>
            Borrar registro
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Cancelar
          </Button>
        </div>
      </Sheet>

      <Toast message={toast} />
    </div>
  );
}
