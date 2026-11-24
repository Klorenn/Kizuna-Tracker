"use client";

import { CalendarCheck, Fire, Warning } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { setNotifyPref } from "@/app/(app)/perfil/actions";
import { Toggle } from "@/components/ui/Toggle";
import type { NotifyPref } from "@/lib/notify-prefs";
import { safeAction } from "@/lib/safe-action";

const RETRY = "No pudimos guardar los cambios. Inténtalo de nuevo.";

function PrefRow({
  kind,
  initial,
  label,
  hint,
  icon,
}: {
  kind: NotifyPref;
  initial: boolean;
  label: string;
  hint: string;
  icon: React.ReactNode;
}) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Optimistic: the switch flips at once and goes back, with the retry copy, when the save fails.
  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    start(async () => {
      const call = await safeAction(() => setNotifyPref(kind, next));
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
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body text-ink">{label}</span>
          <span id={`notify-${kind}-hint`} className="text-small text-muted">
            {hint}
          </span>
        </span>
        <Toggle touch checked={on} onChange={toggle} label={label} describedBy={`notify-${kind}-hint`} disabled={busy} />
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

/** Ajustes > Avisos: opt-outs of the evening streak push and the Sunday summary push. */
export function NotifyPrefSwitches({ streakRisk, weeklySummary }: { streakRisk: boolean; weeklySummary: boolean }) {
  return (
    <>
      <PrefRow
        kind="streak_risk"
        initial={streakRisk}
        label="Aviso de racha en peligro"
        hint="Por la tarde te avisamos si una racha de 3 días o más está por romperse."
        icon={<Fire size={20} weight="light" />}
      />
      <PrefRow
        kind="weekly_summary"
        initial={weeklySummary}
        label="Resumen semanal"
        hint="Los domingos por la noche, cómo te fue en la semana."
        icon={<CalendarCheck size={20} weight="light" />}
      />
    </>
  );
}
