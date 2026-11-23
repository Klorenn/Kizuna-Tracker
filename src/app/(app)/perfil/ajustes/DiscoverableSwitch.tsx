"use client";

import { UsersThree, Warning } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { setDiscoverable } from "@/app/(app)/perfil/actions";
import { Toggle } from "@/components/ui/Toggle";
import { safeAction } from "@/lib/safe-action";

const RETRY = "No pudimos guardar los cambios. Inténtalo de nuevo.";

/**
 * Ajustes > Privacidad: appear in Amigos > Sugerencias and in Explorar. Optimistic: the switch
 * flips at once and goes back, with the retry copy, when the save fails.
 */
export function DiscoverableSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    start(async () => {
      const call = await safeAction(() => setDiscoverable(next));
      const r = call.ok ? call.value : call;
      if (!r.ok) {
        setOn(!next);
        setError(RETRY);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
      <div className="flex min-h-11 items-center gap-3">
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-ink">
          <UsersThree size={20} weight="light" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body text-ink">
            Aparecer en sugerencias y en Explorar
          </span>
          <span id="discoverable-hint" className="text-small text-muted">
            Si lo apagas, no apareces en esas listas. Igual pueden agregarte con tu @usuario o tu enlace de invitación.
          </span>
        </span>
        <Toggle
          touch
          checked={on}
          onChange={toggle}
          label="Aparecer en sugerencias y en Explorar"
          describedBy="discoverable-hint"
          disabled={busy}
        />
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-small text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
