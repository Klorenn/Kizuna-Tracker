"use client";

import { useRef, useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { GroupActions, GroupHabitChoice, GroupInvitePreview } from "@/lib/groups-contract";
import { HabitChoice } from "../create/HabitChoice";
import { commitmentLine, memberCountLabel } from "../list/format";
import { ErrorLine, GroupIconTile, NumText } from "../list/parts";
import { JOIN_ERRORS, runJoin } from "./logic";

export const CONSENT_LINE = "Los miembros verán tus registros y fotos de este hábito.";

/**
 * Body of the join step: the habit choice, the consent line, "Unirme" and a reserved error slot.
 * Props: { commitmentName, habits, choice, onChoice, busy, error, onSubmit }.
 */
export function InviteJoinForm({
  commitmentName,
  habits,
  choice,
  onChoice,
  busy,
  error,
  onSubmit,
}: {
  commitmentName: string;
  habits: { id: string; name: string }[];
  choice: GroupHabitChoice;
  onChoice: (c: GroupHabitChoice) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex w-full flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-small text-ink">Tu hábito para este grupo</p>
        <HabitChoice
          commitmentName={commitmentName}
          habits={habits}
          value={choice}
          onChange={onChoice}
          errorId={error === JOIN_ERRORS.habit ? "join-habit-error" : undefined}
        />
      </div>
      <p className="text-small text-muted">{CONSENT_LINE}</p>
      <div data-form-error className="min-h-10">
        {error ? <ErrorLine id={error === JOIN_ERRORS.habit ? "join-habit-error" : undefined} message={error} /> : null}
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Uniéndote…" : "Unirme"}
      </Button>
    </form>
  );
}

/**
 * Props:
 *  - preview: GroupInvitePreview | null  (null = invalid link)
 *  - signedIn: boolean, loginHref: string  (signed out: a link to log in, the consent line first)
 *  - habits: { id, name }[]  the person's eligible habits
 *  - alreadyMember?: boolean, groupHref?: string  (link to the group; default /grupos)
 *  - code: string, actions: Pick<GroupActions, "join">, onJoined: (id: string) => void
 * Shows only what the preview carries: never member names.
 */
export function InvitePreviewView({
  preview,
  signedIn,
  loginHref,
  habits,
  alreadyMember = false,
  groupHref = "/grupos",
  code,
  actions,
  onJoined,
}: {
  preview: GroupInvitePreview | null;
  signedIn: boolean;
  loginHref: string;
  habits: { id: string; name: string }[];
  alreadyMember?: boolean;
  groupHref?: string;
  code: string;
  actions: Pick<GroupActions, "join">;
  onJoined: (id: string) => void;
}) {
  const [choice, setChoice] = useState<GroupHabitChoice>({ kind: "create" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const inflight = useRef(false);
  const busy = pending || done;

  function join() {
    if (inflight.current) return;
    setError(null);
    start(async () => {
      // runJoin holds the guard; on success it stays locked until the page navigates away
      const r = await runJoin({
        guard: inflight,
        code,
        habit: choice,
        join: actions.join,
        onJoined: (id) => {
          setDone(true);
          onJoined(id);
        },
      });
      if (r && !r.ok) setError(r.error);
    });
  }

  if (!preview) {
    return (
      <Card className="flex flex-col items-center gap-4 px-6 py-8 text-center">
        <p className="text-body font-semibold text-ink">Este enlace ya no sirve. Pide uno nuevo.</p>
        <ButtonLink href={groupHref} variant="secondary" className="w-auto!">
          Ir a Grupos
        </ButtonLink>
      </Card>
    );
  }

  const canJoin = !alreadyMember && !preview.full;
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-8 text-center">
      <GroupIconTile icon={preview.icon} color={preview.color} large />
      <div className="flex min-w-0 max-w-full flex-col gap-1">
        <h1 className="text-title font-semibold text-ink wrap-anywhere">Te invitaron a {preview.name}</h1>
        <p className="text-body text-muted wrap-anywhere">
          <NumText>{commitmentLine(preview.commitment)}</NumText>
        </p>
        <p className="text-small text-muted">
          <NumText>{memberCountLabel(preview.memberCount)}</NumText>
        </p>
      </div>

      {alreadyMember ? (
        <>
          <p className="text-body text-ink">Ya eres parte de este grupo.</p>
          <ButtonLink href={groupHref}>Ver el grupo</ButtonLink>
        </>
      ) : preview.full ? (
        <p className="text-body text-ink">Este grupo está completo.</p>
      ) : null}

      {canJoin && signedIn ? (
        <InviteJoinForm
          commitmentName={preview.commitment.name}
          habits={habits}
          choice={choice}
          onChoice={setChoice}
          busy={busy}
          error={error}
          onSubmit={join}
        />
      ) : null}

      {canJoin && !signedIn ? (
        <>
          <p className="text-small text-muted">{CONSENT_LINE}</p>
          <ButtonLink href={loginHref}>Inicia sesión para unirte</ButtonLink>
        </>
      ) : null}
    </Card>
  );
}
