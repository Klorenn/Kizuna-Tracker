"use client";

import { Check, UserMinus, UserPlus, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addFriendByUsername, removeFriend } from "@/app/(app)/amigos/actions";
import { Button } from "./ui/Button";

/** "Agregar amigo" by @username (search results and public profile). */
export function AddFriendButton({
  username,
  initial = "idle",
  compact = false,
}: {
  username: string;
  initial?: "idle" | "pending" | "accepted";
  compact?: boolean;
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
        Agregar{compact ? "" : " amigo"}
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

export function RemoveFriendButton({ userId, name }: { userId: string; name: string }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        aria-label={`Quitar a ${name} de tus amigos`}
        onClick={() => {
          if (!window.confirm(`¿Quitar a ${name} de tus amigos? Se cancelarán los retos entre ustedes.`)) return;
          start(async () => {
            setError(null);
            const r = await removeFriend(userId);
            if (r.ok) router.refresh();
            else setError(r.error);
          });
        }}
        className="inline-flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-[120ms] hover:bg-field disabled:opacity-50"
      >
        <UserMinus size={20} weight="light" aria-hidden />
      </button>
      {error ? (
        <p role="alert" className="text-small text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
