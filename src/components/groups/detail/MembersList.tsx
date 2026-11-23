"use client";

/**
 * MembersList: the people of a group, and what each person can do about the group.
 *
 * Props: `detail` (id, name, icon, color, commitment, role, archived), `members` (GroupBoardRow[] |
 * null: null = the read failed), `myUserId`, `actions` (`Pick<GroupActions, "update" | "setCommitment" |
 * "archive" | "createInvite" | "leave" | "removeMember" | "setAdmin">`), `retryHref`, and the result
 * callbacks `onLeft`, `onEdited`, `onCommitmentSet`, `onArchived`, `onMemberRemoved`, `onRoleChanged`
 * (the parent keeps its view in step with what the server accepted).
 * Of each member it shows name, @usuario, avatar and role, nothing else.
 * Administrators: "Invitar", a menu per member, "Editar grupo", "Cambiar compromiso", "Archivar
 * grupo". Everyone: "Salir del grupo". An archived group is read-only: no actions at all.
 * Every action has a pending state and a single-flight guard; server errors (`last_admin`,
 * `admin_limit`, `invite_limit`...) show inside the sheet where the action was taken.
 */
import { Archive, DotsThree, PencilSimple, SignOut, Target, UserPlus } from "@phosphor-icons/react";
import { memo, useCallback, useState } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { ListRow, ListSection } from "@/components/ui/ListRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { toHabitColor } from "@/domain/habit-colors";
import type {
  GroupActions,
  GroupBoardRow,
  GroupCommitment,
  GroupDate,
  GroupDetail,
  GroupResult,
  GroupRole,
} from "@/lib/groups-contract";
import {
  CommitmentForm,
  ConfirmBody,
  EditGroupForm,
  InviteView,
  MemberMenuBody,
  type InviteState,
} from "./AdminSheets";
import { copyLink, createRunner, type CopyOutcome, type GroupEditFields } from "./group-logic";
import { PersonLink } from "./parts";

type Runner = ReturnType<typeof createRunner>;
/** `null`: another action was already running and this call was ignored. */
type Done = GroupResult<unknown> | null;

/* ------------------------- handlers (the part tests can call) ------------------------- */

export async function doLeave(
  runner: Runner,
  leave: GroupActions["leave"],
  groupId: string,
  onLeft: () => void,
): Promise<Done> {
  const r = await runner.run(() => leave(groupId));
  if (r?.ok) onLeft();
  return r;
}

export async function doRemove(
  runner: Runner,
  removeMember: GroupActions["removeMember"],
  groupId: string,
  userId: string,
  onRemoved: (userId: string) => void,
): Promise<Done> {
  const r = await runner.run(() => removeMember(groupId, userId));
  if (r?.ok) onRemoved(userId);
  return r;
}

export async function doSetAdmin(
  runner: Runner,
  setAdmin: GroupActions["setAdmin"],
  groupId: string,
  userId: string,
  admin: boolean,
  onChanged: (userId: string, role: GroupRole) => void,
): Promise<Done> {
  const r = await runner.run(() => setAdmin(groupId, userId, admin));
  if (r?.ok) onChanged(userId, admin ? "admin" : "member");
  return r;
}

export async function doInvite(
  runner: Runner,
  createInvite: GroupActions["createInvite"],
  groupId: string,
): Promise<InviteState | null> {
  const r = await runner.run(() => createInvite(groupId));
  if (!r) return null;
  return r.ok ? { status: "ready", url: r.data.url, code: r.data.code } : { status: "error", error: r.error };
}

/** A link is minted on the first open and on retry after an error; a ready (or running) one is reused. */
export function inviteDecision(current: InviteState | null): "create" | "reuse" {
  return current === null || current.status === "error" ? "create" : "reuse";
}

/** The state after tapping "Invitar": the same state when reusing (no call), else a new link or its error. `null`: ignored (a call is running). */
export async function openInvite(
  runner: Runner,
  createInvite: GroupActions["createInvite"],
  groupId: string,
  current: InviteState | null,
): Promise<InviteState | null> {
  if (inviteDecision(current) === "reuse") return current;
  return doInvite(runner, createInvite, groupId);
}

/* ------------------------------------- rows ------------------------------------- */

/** Memoized by value: changing one member's role does not re-render the other rows. */
export const MemberRow = memo(function MemberRow({
  member,
  you,
  canManage,
  onMenu,
}: {
  member: GroupBoardRow;
  you: boolean;
  canManage: boolean;
  onMenu: (member: GroupBoardRow) => void;
}) {
  return (
    <li className="flex items-center gap-1 pl-4 pr-2 py-1.5">
      <PersonLink
        person={member}
        you={you}
        detail={<span className="truncate text-small text-muted">{member.role === "admin" ? "Administrador" : "Miembro"}</span>}
      />
      {canManage && !you ? (
        <IconButton label={`Opciones de ${member.displayName}`} aria-haspopup="dialog" onClick={() => onMenu(member)}>
          <DotsThree size={20} weight="bold" aria-hidden />
        </IconButton>
      ) : null}
    </li>
  );
});

type Open =
  | null
  | { kind: "invite" }
  | { kind: "edit" }
  | { kind: "commitment" }
  | { kind: "archive" }
  | { kind: "leave" }
  | { kind: "member"; userId: string; step: "menu" | "confirm" };

type Detail = Pick<GroupDetail, "id" | "name" | "icon" | "color" | "commitment" | "role" | "archived"> & {
  description?: string | null;
};

export function MembersList({
  detail,
  members,
  myUserId,
  actions,
  retryHref,
  onLeft,
  onEdited,
  onCommitmentSet,
  onArchived,
  onMemberRemoved,
  onRoleChanged,
}: {
  detail: Detail;
  members: GroupBoardRow[] | null;
  myUserId: string;
  actions: Pick<
    GroupActions,
    "update" | "setCommitment" | "archive" | "createInvite" | "leave" | "removeMember" | "setAdmin"
  >;
  retryHref: string;
  onLeft: () => void;
  onEdited: (fields: GroupEditFields) => void;
  onCommitmentSet: (commitment: GroupCommitment, effectiveFrom: GroupDate) => void;
  onArchived: () => void;
  onMemberRemoved: (userId: string) => void;
  onRoleChanged: (userId: string, role: GroupRole) => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [runner] = useState(createRunner);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteState | null>(null);
  const [copy, setCopy] = useState<CopyOutcome | "idle">("idle");
  const [copied, setCopied] = useState<"link" | "code">("link");

  const editable = !detail.archived;
  const admin = editable && detail.role === "admin";

  const show = (next: Open) => {
    setError(null);
    setCopy("idle");
    setOpen(next);
  };
  // a sheet cannot be dismissed while its request is running
  const close = () => {
    if (!pending) show(null);
  };
  const onMenu = useCallback((m: GroupBoardRow) => {
    setError(null);
    setOpen({ kind: "member", userId: m.userId, step: "menu" });
  }, []);

  /** Runs one request with its pending state; a failed result becomes the sheet's error. */
  async function track(run: () => Promise<Done>) {
    if (runner.busy()) return;
    setPending(true);
    setError(null);
    const r = await run();
    setPending(false);
    if (r && !r.ok) setError(r.error);
  }

  async function createLink() {
    if (runner.busy() || inviteDecision(invite) === "reuse") return;
    const current = invite;
    setInvite({ status: "pending" });
    const next = await openInvite(runner, actions.createInvite, detail.id, current);
    if (next) setInvite(next);
  }

  function startInvite() {
    show({ kind: "invite" });
    void createLink();
  }

  async function copyUrl(text: string, what: "link" | "code") {
    setCopied(what);
    setCopy(await copyLink(text, typeof navigator === "undefined" ? undefined : navigator.clipboard));
  }

  const target = open?.kind === "member" ? (members?.find((m) => m.userId === open.userId) ?? null) : null;

  let title = "";
  let body: React.ReactNode = null;
  if (open?.kind === "invite") {
    title = "Invitar al grupo";
    body = <InviteView state={invite ?? { status: "pending" }} copy={copy} copied={copied} onRetry={() => void createLink()} onCopy={(t, what) => void copyUrl(t, what)} />;
  } else if (open?.kind === "edit") {
    title = "Editar grupo";
    body = (
      <EditGroupForm
        initial={{ name: detail.name, icon: detail.icon, color: detail.color, description: detail.description ?? "" }}
        pending={pending}
        error={error}
        onSubmit={(f) =>
          void track(async () => {
            const r = await runner.run(() => actions.update(detail.id, f));
            if (r?.ok) {
              onEdited(f);
              setOpen(null);
            }
            return r;
          })
        }
      />
    );
  } else if (open?.kind === "commitment") {
    title = "Cambiar compromiso";
    body = (
      <CommitmentForm
        initial={detail.commitment}
        pending={pending}
        error={error}
        onSubmit={(c) =>
          void track(async () => {
            const r = await runner.run(() => actions.setCommitment(detail.id, c));
            if (r?.ok) {
              onCommitmentSet(c, r.data.effectiveFrom);
              setOpen(null);
            }
            return r;
          })
        }
      />
    );
  } else if (open?.kind === "archive") {
    title = "Archivar grupo";
    body = (
      <ConfirmBody
        message={`¿Archivar ${detail.name}? Nadie podrá registrar más en él.`}
        confirmLabel="Archivar grupo"
        pendingLabel="Archivando…"
        pending={pending}
        error={error}
        onCancel={close}
        onConfirm={() =>
          void track(async () => {
            const r = await runner.run(() => actions.archive(detail.id));
            if (r?.ok) {
              onArchived();
              setOpen(null);
            }
            return r;
          })
        }
      />
    );
  } else if (open?.kind === "leave") {
    title = "Salir del grupo";
    body = (
      <ConfirmBody
        message={`¿Salir de ${detail.name}? Tu hábito sigue siendo tuyo.`}
        confirmLabel="Salir del grupo"
        pendingLabel="Saliendo…"
        pending={pending}
        error={error}
        onCancel={close}
        onConfirm={() =>
          void track(async () => {
            const r = await doLeave(runner, actions.leave, detail.id, onLeft);
            // close the confirmation: nothing left to tap twice while the page navigates away
            if (r?.ok) setOpen(null);
            return r;
          })
        }
      />
    );
  } else if (open?.kind === "member" && target) {
    const step = open.step;
    title = target.displayName;
    body = (
      <MemberMenuBody
        member={target}
        step={step}
        pending={pending}
        error={error}
        onToggleAdmin={() =>
          void track(async () => {
            const r = await doSetAdmin(runner, actions.setAdmin, detail.id, target.userId, target.role !== "admin", onRoleChanged);
            if (r?.ok) setOpen(null);
            return r;
          })
        }
        onAskRemove={() => {
          setError(null);
          setOpen({ kind: "member", userId: target.userId, step: "confirm" });
        }}
        onConfirmRemove={() =>
          void track(async () => {
            const r = await doRemove(runner, actions.removeMember, detail.id, target.userId, onMemberRemoved);
            if (r?.ok) setOpen(null);
            return r;
          })
        }
        onBack={() => {
          setError(null);
          setOpen({ kind: "member", userId: target.userId, step: "menu" });
        }}
      />
    );
  }

  return (
    <div data-habit-color={toHabitColor(detail.color)} className="flex flex-col gap-4">
      <section aria-label="Miembros" className="flex flex-col gap-2">
        <SectionHeader label="Miembros" />
        {admin ? (
          <Button onClick={startInvite}>
            <UserPlus size={20} weight="light" aria-hidden />
            Invitar
          </Button>
        ) : null}
        {members ? (
          <Card>
            <ul className="divide-y divide-line">
              {members.map((m) => (
                <MemberRow key={m.userId} member={m} you={m.userId === myUserId} canManage={admin} onMenu={onMenu} />
              ))}
            </ul>
          </Card>
        ) : (
          <LoadFailed href={retryHref} />
        )}
      </section>

      {admin ? (
        <ListSection id="group-admin" label="Administración">
          <ListRow icon={<PencilSimple size={20} weight="light" />} label="Editar grupo" onClick={() => show({ kind: "edit" })} chevron />
          <ListRow icon={<Target size={20} weight="light" />} label="Cambiar compromiso" onClick={() => show({ kind: "commitment" })} chevron />
          <ListRow icon={<Archive size={20} weight="light" />} label="Archivar grupo" tone="danger" onClick={() => show({ kind: "archive" })} />
        </ListSection>
      ) : null}

      {editable ? (
        <ListSection id="group-leave" label="Tu participación">
          <ListRow icon={<SignOut size={20} weight="light" />} label="Salir del grupo" tone="danger" onClick={() => show({ kind: "leave" })} />
        </ListSection>
      ) : null}

      {body ? (
        <Sheet open title={title} onClose={close} tall>
          {body}
        </Sheet>
      ) : null}
    </div>
  );
}
