"use client";

import { Check, UserPlus, Warning, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptFriendRequestFrom,
  addFriendByUsername,
  cancelFriendRequest,
  declineFriendRequest,
  sendFriendRequest,
} from "@/app/(app)/amigos/actions";
import type { Person } from "@/lib/discover-data";
import { PersonRow } from "./PersonRow";
import { Button } from "./ui/Button";

function ErrorLine({ children }: { children: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-small text-ink">
      <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
      {children}
    </p>
  );
}

/** Same box as the buttons, so a row never moves when its state changes. */
function StatusText({ children }: { children: string }) {
  return (
    <p className="flex h-11 w-full items-center justify-center gap-1 text-center text-small leading-tight text-muted">
      <Check size={16} weight="light" className="shrink-0" aria-hidden />
      {children}
    </p>
  );
}

type RowState = "none" | "sent" | "incoming" | "accepted";
const START: Record<Person["relation"], RowState> = { none: "none", outgoing: "sent", incoming: "incoming" };

/**
 * A person from discover_people with the action their relation calls for: "Agregar", "Solicitud
 * enviada", or accept / reject for a request they sent you (by person, since the list carries no
 * friendship ids). Each row keeps its own state, so appending the next page never resets it.
 */
export function DiscoverPersonRow({ person }: { person: Person }) {
  const [state, setState] = useState<RowState>(START[person.relation]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  function run(task: () => Promise<{ ok: true; next: RowState } | { ok: false; error: string }>) {
    start(async () => {
      setError(null);
      const r = await task();
      if (r.ok) {
        setState(r.next);
        router.refresh();
      } else setError(r.error);
    });
  }

  let action;
  if (state === "sent") action = <StatusText>Solicitud enviada</StatusText>;
  else if (state === "accepted") action = <StatusText>Ya son amigos</StatusText>;
  else if (state === "incoming")
    action = (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          aria-label={`Rechazar a ${person.displayName}`}
          onClick={() =>
            run(async () => {
              const r = await declineFriendRequest(person.id);
              return r.ok ? { ok: true, next: "none" } : r;
            })
          }
          className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent transition-colors duration-150 hover:bg-accent-soft disabled:opacity-50"
        >
          <X size={20} weight="light" aria-hidden />
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label={`Aceptar a ${person.displayName}`}
          onClick={() =>
            run(async () => {
              const r = await acceptFriendRequestFrom(person.id);
              return r.ok ? { ok: true, next: "accepted" } : r;
            })
          }
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-colors duration-150 hover:bg-accent-hover disabled:opacity-50"
        >
          <Check size={20} weight="light" aria-hidden />
        </button>
      </div>
    );
  else
    action = (
      <Button
        className="h-11! px-3!"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const r = await sendFriendRequest(person.id);
            return r.ok ? { ok: true, next: r.status === "accepted" ? "accepted" : "sent" } : r;
          })
        }
      >
        <UserPlus size={20} weight="light" aria-hidden />
        Agregar
      </Button>
    );

  return <PersonRow person={person} action={action} notice={error ? <ErrorLine>{error}</ErrorLine> : null} />;
}

/** A request the person sent, in Amigos > Solicitudes > Enviadas: "Cancelar" withdraws it. */
export function SentRequestRow({
  person,
}: {
  person: { id: string; username: string; displayName: string; avatarSrc: string | null; avatarPreset: number | null };
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <PersonRow
      person={person}
      showMeta={false}
      action={
        <Button
          variant="secondary"
          className="h-11! px-3!"
          disabled={busy}
          aria-label={`Cancelar solicitud a ${person.displayName}`}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await cancelFriendRequest(person.id);
              if (r.ok) router.refresh();
              else setError(r.error);
            })
          }
        >
          Cancelar
        </Button>
      }
      notice={error ? <ErrorLine>{error}</ErrorLine> : null}
    />
  );
}

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
