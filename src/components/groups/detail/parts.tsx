"use client";

/** Small pieces shared by the group detail views. Presentational only. */
import { Warning } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { avatarUrl } from "@/lib/avatar";
import type { GroupCommitment, GroupPerson } from "@/lib/groups-contract";

/** Numbers are always in the mono face. */
export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono">{children}</span>;
}

/** "<compromiso> · N por semana" ("todos los días" for 7, " · con foto" when a photo is required). */
export function CommitmentText({ commitment }: { commitment: GroupCommitment }) {
  return (
    <>
      {commitment.name} ·{" "}
      {commitment.targetPerWeek === 7 ? (
        "todos los días"
      ) : (
        <>
          <Mono>{commitment.targetPerWeek}</Mono> por semana
        </>
      )}
      {commitment.requiresPhoto ? " · con foto" : null}
    </>
  );
}

/** Plain-text twin of `CommitmentText`, for accessible names and test assertions. */
export function commitmentLine(c: GroupCommitment): string {
  const per = c.targetPerWeek === 7 ? "todos los días" : `${c.targetPerWeek} por semana`;
  return `${c.name} · ${per}${c.requiresPhoto ? " · con foto" : ""}`;
}

/** A person as a link to their public profile: avatar, name (one line), @usuario (mono). Nothing else of them. */
export function PersonLink({
  person,
  you = false,
  detail,
}: {
  person: GroupPerson;
  you?: boolean;
  /** A third line under @usuario (role, for example). */
  detail?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar name={person.displayName} src={avatarUrl(person.avatarPath)} preset={person.avatarPreset} />
      <Link
        href={`/@${person.username}`}
        className="flex min-h-11 min-w-0 flex-1 items-center rounded-md focus-visible:outline-offset-[-2px]"
      >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-body font-medium text-ink">{person.displayName}</span>
          {you ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-field px-2 text-small font-medium text-ink">Tú</span>
          ) : null}
        </span>
        <span className="truncate font-mono text-small text-muted">@{person.username}</span>
        {detail}
      </span>
      </Link>
    </div>
  );
}

/** An error where the action was taken: ink text with the alert icon (never colour alone). */
export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-small text-pretty text-ink">
      <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
