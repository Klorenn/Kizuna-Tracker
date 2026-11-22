"use client";

import { Check, Warning, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respondFriendRequest } from "@/app/(app)/amigos/actions";
import { Avatar } from "./ui/Avatar";

export function FriendRequestRow({
  id,
  displayName,
  username,
}: {
  id: string;
  displayName: string;
  username: string;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function respond(accept: boolean) {
    start(async () => {
      setError(null);
      const r = await respondFriendRequest(id, accept);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Avatar name={displayName} />
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p className="truncate text-body font-medium text-ink">{displayName}</p>
          <p className="truncate text-small text-muted">@{username}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label={`Rechazar a ${displayName}`}
          onClick={() => respond(false)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-accent text-accent transition-colors duration-[120ms] hover:bg-accent-soft disabled:opacity-50"
        >
          <X size={20} weight="light" aria-hidden />
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label={`Aceptar a ${displayName}`}
          onClick={() => respond(true)}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-colors duration-[120ms] hover:bg-accent-hover disabled:opacity-50"
        >
          <Check size={20} weight="light" aria-hidden />
        </button>
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
