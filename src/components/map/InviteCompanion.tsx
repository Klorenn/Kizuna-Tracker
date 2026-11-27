"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { inviteCompanion } from "@/app/(app)/mapa/actions";
import { Sheet } from "@/components/ui/Sheet";

export function InviteCompanion({
  outingId,
  friends,
}: {
  outingId: string;
  friends: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <>
      <button type="button" className="inline-flex h-12 items-center text-body text-ink" onClick={() => setOpen(true)}>
        Invitar
      </button>
      <Sheet open={open} title="Invitar" onClose={() => setOpen(false)}>
        {friends.length === 0 ? (
          <Link href="/amigos" className="text-body text-accent">
            Todavía no tienes amigos para invitar.
          </Link>
        ) : (
          <ul className="flex flex-col">
            {friends.map((friend) => (
              <li key={friend.id}>
                <button
                  type="button"
                  disabled={busy}
                  className="flex min-h-11 w-full items-center py-2 text-left text-body text-ink disabled:opacity-50"
                  onClick={() =>
                    start(async () => {
                      const result = await inviteCompanion(outingId, friend.id);
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      setOpen(false);
                      router.refresh();
                    })
                  }
                >
                  {friend.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-small text-ink">
            {error}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}
