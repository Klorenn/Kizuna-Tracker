"use client";

import { Check, UserPlus, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addFriendByUsername } from "@/app/(app)/amigos/actions";
import { Button } from "./ui/Button";

/** "Agregar amigo" by @username (search results and public profile). */
export function AddFriendButton({
  username,
  initial = "idle",
  compact = false,
  incoming = false,
}: {
  username: string;
  initial?: "idle" | "pending" | "accepted";
  compact?: boolean;
  /** They already sent you a request: the button accepts it. */
  incoming?: boolean;
}) {
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  if (status !== "idle") {
    return (
      <p className="flex h-12 items-center justify-center gap-2 text-body text-muted">
        <Check size={20} weight="light" aria-hidden />
        {status === "accepted" ? "Ya son amigos" : "Solicitud enviada"}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        className={compact ? "h-11 w-auto!" : ""}
        disabled={busy}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await addFriendByUsername(username);
            if (r.ok) {
              setStatus(r.status);
              router.refresh();
            } else setError(r.error);
          })
        }
      >
        <UserPlus size={20} weight="light" aria-hidden />
        {incoming ? (compact ? "Aceptar" : "Aceptar solicitud") : compact ? "Agregar" : "Agregar amigo"}
      </Button>
      {error ? (
        <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
