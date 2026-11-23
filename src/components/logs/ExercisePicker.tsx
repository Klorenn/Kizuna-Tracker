"use client";

import { Archive, PencilSimple, Plus, Warning } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { archiveExercise, createExercise, renameExercise } from "@/app/(app)/registros/workout-actions";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { DAY_TYPE_LABEL, MUSCLE_GROUPS, type MuscleGroup } from "@/domain/logs";

export type ExerciseOption = {
  id: string;
  name: string;
  group: MuscleGroup;
  /** Created by the user (can be renamed and archived); catalog ones cannot. */
  own: boolean;
  archived: boolean;
};

const norm = (s: string) =>
  s
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-[6px] text-small text-pretty text-ink">
      <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
      {message}
    </p>
  );
}

/**
 * Sheet to add an exercise: search, the built-in catalog by muscle group, the user's own
 * exercises (rename / archive) and an inline "Nuevo ejercicio".
 */
export function ExercisePicker({
  open,
  exercises,
  usedIds,
  onClose,
  onPick,
  onCreated,
  onRenamed,
  onArchived,
}: {
  open: boolean;
  exercises: ExerciseOption[];
  /** Already in the workout: shown but not selectable. */
  usedIds: string[];
  onClose: () => void;
  onPick: (exercise: ExerciseOption) => void;
  onCreated: (exercise: ExerciseOption) => void;
  onRenamed: (id: string, name: string) => void;
  onArchived: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<MuscleGroup>("legs");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = exercises.filter((e) => !e.archived && (query === "" || norm(e.name).includes(norm(query))));
  const own = visible.filter((e) => e.own);

  function reset() {
    setQuery("");
    setCreating(false);
    setNewName("");
    setEditing(null);
    setArchiving(null);
    setError(null);
  }
  function close() {
    reset();
    onClose();
  }

  function create() {
    setError(null);
    start(async () => {
      const r = await createExercise({ name: newName, group: newGroup });
      if (!r.ok) return setError(r.error);
      const created: ExerciseOption = { id: r.id, name: newName.trim(), group: newGroup, own: true, archived: false };
      onCreated(created);
      reset();
      onPick(created);
    });
  }

  function rename() {
    if (!editing) return;
    setError(null);
    start(async () => {
      const r = await renameExercise(editing.id, editing.name);
      if (!r.ok) return setError(r.error);
      onRenamed(editing.id, editing.name.trim());
      setEditing(null);
    });
  }

  function archive(id: string) {
    setError(null);
    start(async () => {
      const r = await archiveExercise(id);
      if (!r.ok) return setError(r.error);
      onArchived(id);
      setArchiving(null);
    });
  }

  function row(e: ExerciseOption) {
    const used = usedIds.includes(e.id);
    if (editing?.id === e.id) {
      return (
        <li key={e.id} className="flex flex-col gap-2 py-2">
          <Input
            label="Nombre del ejercicio"
            value={editing.name}
            maxLength={60}
            onChange={(ev) => setEditing({ id: e.id, name: ev.target.value })}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={rename} disabled={pending}>
              Guardar
            </Button>
          </div>
        </li>
      );
    }
    if (archiving === e.id) {
      return (
        <li key={e.id} className="flex flex-col gap-2 py-2">
          <p className="text-body text-ink">¿Archivar {e.name}?</p>
          <p className="text-small text-muted">Deja de aparecer aquí. Tus registros anteriores no cambian.</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setArchiving(null)}>
              Cancelar
            </Button>
            <Button onClick={() => archive(e.id)} disabled={pending}>
              Archivar
            </Button>
          </div>
        </li>
      );
    }
    return (
      <li key={e.id} className="flex items-center">
        <button
          type="button"
          disabled={used}
          onClick={() => {
            reset();
            onPick(e);
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md py-2 text-left text-body text-ink hover:bg-field disabled:text-muted disabled:hover:bg-transparent"
        >
          <span className="min-w-0 flex-1 truncate">{e.name}</span>
          {used ? <span className="shrink-0 text-small text-muted">Ya está</span> : null}
        </button>
        {e.own ? (
          <>
            <IconButton label={`Renombrar ${e.name}`} onClick={() => (setError(null), setEditing({ id: e.id, name: e.name }))}>
              <PencilSimple size={20} weight="light" aria-hidden />
            </IconButton>
            <IconButton label={`Archivar ${e.name}`} onClick={() => (setError(null), setArchiving(e.id))}>
              <Archive size={20} weight="light" aria-hidden />
            </IconButton>
          </>
        ) : null}
      </li>
    );
  }

  return (
    <Sheet open={open} title="Agregar ejercicio" onClose={close} tall>
      <Input
        label="Buscar"
        type="search"
        value={query}
        placeholder="Sentadilla, remo…"
        onChange={(e) => setQuery(e.target.value)}
      />

      {creating ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <Input
            label="Nombre del ejercicio"
            value={newName}
            maxLength={60}
            placeholder="Remo Pendlay"
            onChange={(e) => setNewName(e.target.value)}
          />
          <div role="group" aria-label="Grupo muscular" className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map((g) => (
              <Chip key={g} selected={newGroup === g} onClick={() => setNewGroup(g)}>
                {DAY_TYPE_LABEL[g]}
              </Chip>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button onClick={create} disabled={pending}>
              Crear
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setNewName(query.trim());
            setError(null);
            setCreating(true);
          }}
        >
          <Plus size={20} weight="light" aria-hidden />
          Nuevo ejercicio
        </Button>
      )}

      {error ? <ErrorLine message={error} /> : null}

      {own.length > 0 ? (
        <section className="flex flex-col gap-1">
          <SectionHeader label="Tus ejercicios" />
          <ul className="flex flex-col">{own.map(row)}</ul>
        </section>
      ) : null}

      {MUSCLE_GROUPS.map((g) => {
        const items = visible.filter((e) => !e.own && e.group === g);
        if (items.length === 0) return null;
        return (
          <section key={g} className="flex flex-col gap-1">
            <SectionHeader label={DAY_TYPE_LABEL[g]} />
            <ul className="flex flex-col">{items.map(row)}</ul>
          </section>
        );
      })}

      {visible.length === 0 ? (
        <p className="text-body text-muted">Nada con ese nombre. Puedes crearlo con “Nuevo ejercicio”.</p>
      ) : null}
    </Sheet>
  );
}
