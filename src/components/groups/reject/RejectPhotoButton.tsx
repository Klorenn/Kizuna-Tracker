"use client";

/**
 * RejectPhotoButton: the admin's "Rechazar foto" for a photo on the group wall (drop it inside a
 * wall photo card; it renders nothing when the rules are not met, so the card can always mount it).
 *
 * Props: `groupId`, `checkinId`, `ownerId`, `ownerName`, `myUserId`, `role`, `archived`,
 * `requiresPhoto` (the group's commitment), `hasPhoto` (the check-in carries a photo), `createdAt`
 * (the check-in's creation instant), `now` (REQUIRED, epoch ms from the page: no clock is read
 * here, so server and client render the same),`actions: Pick<GroupFineActions, "rejectPhoto">`, `onRejected?(checkinId)`.
 * Shown only to admins, on another person's photo, less than 24 hours old, when the commitment
 * requires a photo. The reason is typed in a sheet and only that person sees it. After the server
 * accepts, the button is replaced in the same slot by "Foto rechazada" (no layout shift).
 * `RejectForm` is the sheet body: `pending`, `error`, `onSubmit(reason)`.
 */
import { Prohibit } from "@phosphor-icons/react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import type { GroupRole } from "@/lib/groups-contract";
import { FINE_LIMITS, type GroupFineActions } from "@/lib/groups-fines-contract";
import { createRunner } from "../detail/group-logic";
import { ErrorLine } from "../detail/parts";
import { runAndNotify } from "../fund/fund-logic";
import { canRejectPhoto, prepareReason } from "./reject-logic";

export function RejectForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onSubmit: (reason: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const r = prepareReason(text);
    setLocal(r.ok ? null : r.error);
    if (r.ok) onSubmit(r.reason);
  }

  const shown = local ?? error;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-small text-ink">
          Motivo (lo verá solo esa persona)
        </label>
        <textarea
          id={id}
          name="reject-reason"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={FINE_LIMITS.reasonMax}
          disabled={pending}
          className="w-full resize-none rounded-md border border-outline-strong bg-paper px-3 py-2 text-body text-ink caret-accent outline-none focus-visible:border-accent"
        />
        <p className="text-right font-mono text-small text-muted">
          {text.length}/{FINE_LIMITS.reasonMax}
        </p>
      </div>
      {shown ? <ErrorLine>{shown}</ErrorLine> : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Rechazando…" : "Rechazar"}
      </Button>
    </form>
  );
}

export function RejectPhotoButton({
  groupId,
  checkinId,
  ownerId,
  ownerName,
  myUserId,
  role,
  archived,
  requiresPhoto,
  hasPhoto,
  createdAt,
  now,
  actions,
  onRejected,
}: {
  groupId: string;
  checkinId: string;
  ownerId: string;
  ownerName: string;
  myUserId: string;
  role: GroupRole;
  archived: boolean;
  requiresPhoto: boolean;
  hasPhoto: boolean;
  createdAt: string;
  now: number;
  actions: Pick<GroupFineActions, "rejectPhoto">;
  onRejected?: (checkinId: string) => void;
}) {
  const [runner] = useState(createRunner);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done)
    return (
      <p role="status" className="flex min-h-11 items-center text-small font-medium text-ink">
        Foto rechazada
      </p>
    );
  if (!canRejectPhoto({ role, archived, requiresPhoto, hasPhoto, ownerId, myUserId, createdAt, now }))
    return null;

  async function submit(reason: string) {
    if (runner.busy()) return;
    setPending(true);
    setError(null);
    const r = await runAndNotify(runner, () => actions.rejectPhoto(groupId, checkinId, reason), () => {
      setDone(true);
      setOpen(false);
      onRejected?.(checkinId);
    });
    setPending(false);
    if (r && !r.ok) setError(r.error);
  }

  return (
    <>
      <Button
        variant="ghost"
        className="h-11!"
        aria-haspopup="dialog"
        aria-label={`Rechazar foto de ${ownerName}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Prohibit size={20} weight="light" aria-hidden />
        Rechazar foto
      </Button>
      {open ? (
        <Sheet open title="Rechazar foto" onClose={() => (pending ? undefined : setOpen(false))}>
          <RejectForm pending={pending} error={error} onSubmit={(reason) => void submit(reason)} />
        </Sheet>
      ) : null}
    </>
  );
}
