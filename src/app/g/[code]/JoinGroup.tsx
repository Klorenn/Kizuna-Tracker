"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { join } from "@/app/(app)/grupos/actions";
import { InvitePreviewView } from "@/components/groups/join/InvitePreviewView";
import { watchAlreadyMember } from "@/domain/group-join";
import type { GroupInvitePreview } from "@/lib/groups-contract";

/**
 * Binds the join action to the invitation view. A person who is already in the group learns it
 * from the join answer: the form gives way to "Ya eres parte de este grupo." and a link to Grupos.
 * After joining, go to the group.
 */
export function JoinGroup({
  preview,
  signedIn,
  loginHref,
  habits,
  code,
  groupHref = "/grupos",
  alreadyMember: member = false,
  fine = null,
}: {
  /** The fine in force, when the group has one: shown on the invitation; after joining the person lands on the fund to answer it. */
  fine?: { amount: number; purpose: string } | null;
  preview: GroupInvitePreview | null;
  signedIn: boolean;
  loginHref: string;
  habits: { id: string; name: string }[];
  code: string;
  groupHref?: string;
  /** The database says the signed-in person is already in the group. */
  alreadyMember?: boolean;
}) {
  const router = useRouter();
  const [alreadyMember, setAlreadyMember] = useState(member);
  const actions = useMemo(() => ({ join: watchAlreadyMember(join, () => setAlreadyMember(true)) }), []);
  return (
    <InvitePreviewView
      preview={preview}
      signedIn={signedIn}
      loginHref={loginHref}
      habits={habits}
      alreadyMember={alreadyMember}
      groupHref={groupHref}
      code={code}
      actions={actions}
      fine={fine}
      onJoined={(id) => router.replace(fine ? `/grupos/${id}?seccion=fondo` : `/grupos/${id}`)}
    />
  );
}
