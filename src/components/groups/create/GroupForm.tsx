"use client";

import { useId, useRef, useState, useTransition } from "react";
import { ColorPicker } from "@/components/ColorPicker";
import { IconPicker } from "@/components/IconPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { DEFAULT_HABIT_COLOR, toHabitColor } from "@/domain/habit-colors";
import { GROUP_LIMITS, type GroupActions, type GroupDraft } from "@/lib/groups-contract";
import { toGroupIcon } from "../list/format";
import { ErrorLine } from "../list/parts";
import { HabitChoice } from "./HabitChoice";
import { runCreate, validateGroupDraft, type GroupDraftErrors } from "./logic";
import { Stepper } from "./Stepper";

/**
 * Props:
 *  - habits: { id, name }[]  the person's eligible habits (none: only "Crear «…»" is offered)
 *  - actions: Pick<GroupActions, "create">
 *  - onCreated: (id: string) => void  called once with the new group's id
 * Client validation uses GROUP_LIMITS and shows the binding copy once the person tries to submit;
 * a server error is shown as returned. Every field keeps one reserved helper/error line.
 */
export function GroupFormBody({
  draft,
  habits,
  errors,
  serverError,
  busy,
  onChange,
  onSubmit,
}: {
  draft: GroupDraft;
  habits: { id: string; name: string }[];
  errors: GroupDraftErrors;
  serverError: string | null;
  busy: boolean;
  onChange: (draft: GroupDraft) => void;
  onSubmit: () => void;
}) {
  const uid = useId();
  const set = (patch: Partial<GroupDraft>) => onChange({ ...draft, ...patch });
  const setCommitment = (patch: Partial<GroupDraft["commitment"]>) =>
    onChange({ ...draft, commitment: { ...draft.commitment, ...patch } });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <Input
        label="Nombre del grupo"
        name="group-name"
        autoComplete="off"
        value={draft.name}
        onChange={(e) => set({ name: e.target.value })}
        error={errors.name}
        helper={`Entre ${GROUP_LIMITS.nameMin} y ${GROUP_LIMITS.nameMax} letras.`}
      />
      <Input
        label="Descripción (opcional)"
        name="group-description"
        autoComplete="off"
        value={draft.description}
        onChange={(e) => set({ description: e.target.value })}
        error={errors.description}
        helper={`Hasta ${GROUP_LIMITS.descriptionMax} letras.`}
      />

      <div role="group" aria-labelledby={`${uid}-group-icon`} className="flex flex-col gap-2">
        <p id={`${uid}-group-icon`} className="text-small text-ink">Ícono del grupo</p>
        <IconPicker value={toGroupIcon(draft.icon)} onChange={(icon) => set({ icon })} />
      </div>
      <ColorPicker value={toHabitColor(draft.color || DEFAULT_HABIT_COLOR)} onChange={(color) => set({ color })} />

      <Input
        label="Compromiso"
        name="group-commitment"
        autoComplete="off"
        placeholder="Ir al gym"
        value={draft.commitment.name}
        onChange={(e) => setCommitment({ name: e.target.value })}
        error={errors.commitment}
        helper={`Hasta ${GROUP_LIMITS.commitmentMax} letras.`}
      />
      <div role="group" aria-labelledby={`${uid}-commitment-icon`} className="flex flex-col gap-2">
        <p id={`${uid}-commitment-icon`} className="text-small text-ink">Ícono del compromiso</p>
        <IconPicker value={toGroupIcon(draft.commitment.icon)} onChange={(icon) => setCommitment({ icon })} />
      </div>
      <div className="flex flex-col gap-2">
        <Stepper
          errorId={errors.target ? `${uid}-target-error` : undefined}
          label="Veces por semana"
          value={draft.commitment.targetPerWeek}
          min={GROUP_LIMITS.targetMin}
          max={GROUP_LIMITS.targetMax}
          onChange={(targetPerWeek) => setCommitment({ targetPerWeek })}
        />
        {errors.target ? <ErrorLine id={`${uid}-target-error`} message={errors.target} /> : null}
      </div>
      <div className="flex items-center gap-3">
        <p id="group-photo-label" className="flex-1 text-body text-ink">
          Pedir foto como prueba
        </p>
        <Toggle
          touch
          checked={draft.commitment.requiresPhoto}
          onChange={(requiresPhoto) => setCommitment({ requiresPhoto })}
          label="Pedir foto como prueba"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-small text-ink">Tu hábito para este grupo</p>
        <HabitChoice
          errorId={errors.habit ? `${uid}-habit-error` : undefined}
          commitmentName={draft.commitment.name}
          habits={habits}
          value={draft.habit}
          onChange={(habit) => set({ habit })}
        />
        {errors.habit ? <ErrorLine id={`${uid}-habit-error`} message={errors.habit} /> : null}
      </div>

      <div data-form-error className="min-h-10">
        {serverError ? <ErrorLine message={serverError} /> : null}
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Creando…" : "Crear grupo"}
      </Button>
    </form>
  );
}

const EMPTY_DRAFT: GroupDraft = {
  name: "",
  icon: "target",
  color: DEFAULT_HABIT_COLOR,
  description: "",
  commitment: { name: "", icon: "target", targetPerWeek: 3, requiresPhoto: false },
  habit: { kind: "create" },
};

export function GroupForm({
  habits,
  actions,
  onCreated,
}: {
  habits: { id: string; name: string }[];
  actions: Pick<GroupActions, "create">;
  onCreated: (id: string) => void;
}) {
  const [draft, setDraft] = useState<GroupDraft>(EMPTY_DRAFT);
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const busy = pending || done;
  const inflight = useRef(false);

  const errors = attempted ? validateGroupDraft(draft) : {};

  function submit() {
    if (inflight.current) return;
    setAttempted(true);
    setServerError(null);
    start(async () => {
      // runCreate holds the guard; on success it stays locked until the page navigates away
      const r = await runCreate({
        guard: inflight,
        draft,
        create: actions.create,
        onCreated: (id) => {
          setDone(true);
          onCreated(id);
        },
      });
      if (r && !r.ok && "error" in r) setServerError(r.error);
    });
  }

  return (
    <GroupFormBody
      draft={draft}
      habits={habits}
      errors={errors}
      serverError={serverError}
      busy={busy}
      onChange={setDraft}
      onSubmit={submit}
    />
  );
}
