"use client";

import { Check, Warning, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respondFriendRequest } from "@/app/(app)/amigos/actions";
import { Button } from "@/components/ui/Button";

/** Incoming request on a profile: "Rechazar" / "Aceptar". The page re-renders as a friend on accept. */
export function RequestButtons({ friendshipId, name }: { friendshipId: string; name: string }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function respond(accept: boolean) {
    start(async () => {
      setError(null);
      const r = await respondFriendRequest(friendshipId, accept);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-muted">{name} te envió una solicitud de amistad.</p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => respond(false)}>
          <X size={20} weight="light" aria-hidden />
          Rechazar
        </Button>
        <Button disabled={busy} onClick={() => respond(true)}>
          <Check size={20} weight="light" aria-hidden />
          Aceptar
        </Button>
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
