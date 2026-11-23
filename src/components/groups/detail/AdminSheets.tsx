"use client";

/**
 * The bodies of the sheets of the group detail (invite link, edit group, change commitment,
 * confirmations, member menu). Each one is presentational: it receives its state and callbacks, so
 * every state renders the same on the server and in tests. `MembersList` owns the Sheet around them
 * and the actions behind them.
 */
import { Check, Minus, Plus } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { ColorPicker } from "@/components/ColorPicker";
import { IconPicker } from "@/components/IconPicker";
import { formatInviteCode } from "@/domain/groups";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { toHabitColor } from "@/domain/habit-colors";
import { GROUP_LIMITS, type GroupBoardRow, type GroupCommitment } from "@/lib/groups-contract";
import {
  iconKeyOf,
  validateCommitment,
  validateEdit,
  type CopyOutcome,
  type GroupEditFields,
} from "./group-logic";
import { ErrorLine, Mono } from "./parts";

/* --------------------------------- invitation --------------------------------- */

export type InviteState = { status: "pending" } | { status: "ready"; url: string; code: string } | { status: "error"; error: string };

export function InviteView({
  state,
  copy,
  copied = "link",
  onRetry,
  onCopy,
}: {
  state: InviteState;
  copy: CopyOutcome | "idle";
  /** What the last copy was, for the button that says "copiado". */
  copied?: "link" | "code";
  onRetry: () => void;
  onCopy: (text: string, what: "link" | "code") => void;
}) {
  if (state.status === "pending")
    return (
      <p role="status" aria-busy="true" className="py-6 text-center text-small text-muted">
        Creando enlace…
      </p>
    );
  if (state.status === "error")
    return (
      <div className="flex flex-col gap-3">
        <ErrorLine>{state.error}</ErrorLine>
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-muted">
        Cualquiera con este enlace puede unirse al grupo mientras haya lugar. Vence en <Mono>7</Mono> días.
      </p>
      <Input
        label="Enlace de invitación"
        name="invite-url"
        value={state.url}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono"
      />
      <Button onClick={() => onCopy(state.url, "link")} aria-live="polite">
        {copy === "copied" && copied === "link" ? (
          <>
            <Check size={20} weight="light" aria-hidden />
            Enlace copiado
          </>
        ) : (
          "Copiar enlace"
        )}
      </Button>
      <p className="text-body text-muted">O comparte el código: se escribe en «Tengo un enlace».</p>
      <Input
        label="Código de invitación"
        name="invite-code"
        value={formatInviteCode(state.code)}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        className="font-mono"
      />
      <Button variant="secondary" onClick={() => onCopy(formatInviteCode(state.code), "code")} aria-live="polite">
        {copy === "copied" && copied === "code" ? (
          <>
            <Check size={20} weight="light" aria-hidden />
            Código copiado
          </>
        ) : (
          "Copiar código"
        )}
      </Button>
      {copy === "unavailable" ? (
        <ErrorLine>No pudimos copiar el enlace. Selecciónalo y cópialo a mano.</ErrorLine>
      ) : null}
    </div>
  );
}

/* ----------------------------------- edit group ----------------------------------- */

export function prepareEdit(f: GroupEditFields): { ok: true; fields: GroupEditFields } | { ok: false; error: string } {
  const error = validateEdit(f);
  return error ? { ok: false, error } : { ok: true, fields: { ...f, name: f.name.trim(), description: f.description.trim() } };
}

export function EditGroupForm({
  initial,
  pending,
  error,
  onSubmit,
}: {
  initial: GroupEditFields;
  pending: boolean;
  error: string | null;
  onSubmit: (fields: GroupEditFields) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [icon, setIcon] = useState(iconKeyOf(initial.icon));
  const [color, setColor] = useState(toHabitColor(initial.color));
  const [local, setLocal] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const r = prepareEdit({ name, description, icon, color });
    setLocal(r.ok ? null : r.error);
    if (r.ok) onSubmit(r.fields);
  }

  const shown = local ?? error;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Nombre del grupo"
        name="group-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={GROUP_LIMITS.nameMax * 2}
        disabled={pending}
        autoComplete="off"
      />
      <Input
        label="Descripción (opcional)"
        name="group-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={pending}
        autoComplete="off"
      />
      <IconPicker value={icon} onChange={setIcon} />
      <ColorPicker value={color} onChange={setColor} />
      {shown ? <ErrorLine>{shown}</ErrorLine> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

/* --------------------------------- change commitment --------------------------------- */

export const stepTarget = (n: number, delta: number): number =>
  Math.min(GROUP_LIMITS.targetMax, Math.max(GROUP_LIMITS.targetMin, n + delta));

export function prepareCommitment(
  c: GroupCommitment,
): { ok: true; commitment: GroupCommitment } | { ok: false; error: string } {
  const error = validateCommitment(c);
  return error ? { ok: false, error } : { ok: true, commitment: { ...c, name: c.name.trim() } };
}

export function CommitmentForm({
  initial,
  pending,
  error,
  onSubmit,
}: {
  initial: GroupCommitment;
  pending: boolean;
  error: string | null;
  onSubmit: (commitment: GroupCommitment) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(iconKeyOf(initial.icon));
  const [target, setTarget] = useState(initial.targetPerWeek);
  const [photo, setPhoto] = useState(initial.requiresPhoto);
  const [local, setLocal] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const r = prepareCommitment({ name, icon, targetPerWeek: target, requiresPhoto: photo });
    setLocal(r.ok ? null : r.error);
    if (r.ok) onSubmit(r.commitment);
  }

  const shown = local ?? error;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-body text-muted">
        Se aplica desde el próximo lunes. Hasta entonces sigue valiendo el compromiso actual.
      </p>
      <Input
        label="Compromiso"
        name="commitment-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={GROUP_LIMITS.commitmentMax * 2}
        disabled={pending}
        autoComplete="off"
      />
      <IconPicker value={icon} onChange={setIcon} />
      <div role="group" aria-label="Veces por semana" className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-small text-ink">Veces por semana</span>
        <IconButton
          label="Una vez menos por semana"
          disabled={pending || target <= GROUP_LIMITS.targetMin}
          onClick={() => setTarget((n) => stepTarget(n, -1))}
          className="disabled:opacity-40"
        >
          <Minus size={20} weight="light" aria-hidden />
        </IconButton>
        <output className="w-24 text-center text-body text-ink">
          {target === 7 ? "todos los días" : <Mono>{target}</Mono>}
        </output>
        <IconButton
          label="Una vez más por semana"
          disabled={pending || target >= GROUP_LIMITS.targetMax}
          onClick={() => setTarget((n) => stepTarget(n, 1))}
          className="disabled:opacity-40"
        >
          <Plus size={20} weight="light" aria-hidden />
        </IconButton>
      </div>
      <div className="flex items-center gap-3">
        <span id="commitment-photo" className="min-w-0 flex-1 text-body text-ink">
          Pedir foto como prueba
        </span>
        <Toggle checked={photo} onChange={setPhoto} label="Pedir foto como prueba" describedBy="commitment-photo" disabled={pending} touch />
      </div>
      {shown ? <ErrorLine>{shown}</ErrorLine> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Cambiar compromiso"}
      </Button>
    </form>
  );
}

/* ----------------------------------- confirmations ----------------------------------- */

const DANGER = "border-alert! text-alert-text! hover:bg-alert-soft!";

export function ConfirmBody({
  message,
  confirmLabel,
  pendingLabel = "Un momento…",
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  pendingLabel?: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-pretty text-ink">{message}</p>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <div className="flex flex-col gap-2">
        <Button variant="secondary" className={DANGER} disabled={pending} onClick={onConfirm}>
          {pending ? pendingLabel : confirmLabel}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------ member menu ------------------------------------ */

export function MemberMenuBody({
  member,
  step,
  pending,
  error,
  onToggleAdmin,
  onAskRemove,
  onConfirmRemove,
  onBack,
}: {
  member: Pick<GroupBoardRow, "displayName" | "role">;
  step: "menu" | "confirm";
  pending: boolean;
  error: string | null;
  onToggleAdmin: () => void;
  onAskRemove: () => void;
  onConfirmRemove: () => void;
  onBack: () => void;
}) {
  if (step === "confirm")
    return (
      <ConfirmBody
        message={`¿Sacar a ${member.displayName} del grupo? Su hábito sigue siendo suyo.`}
        confirmLabel="Sacar del grupo"
        pendingLabel="Sacando…"
        pending={pending}
        error={error}
        onConfirm={onConfirmRemove}
        onCancel={onBack}
      />
    );
  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Button variant="secondary" disabled={pending} onClick={onToggleAdmin}>
        {pending ? "Un momento…" : member.role === "admin" ? "Quitar administrador" : "Hacer administrador"}
      </Button>
      <Button variant="secondary" className={DANGER} disabled={pending} onClick={onAskRemove}>
        Sacar del grupo
      </Button>
    </div>
  );
}
