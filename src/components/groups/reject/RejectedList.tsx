"use client";

/**
 * RejectedList: the photos rejected in the running week, for admins ("Fotos rechazadas").
 *
 * Props: `groupId`, `items: GroupRejectedItem[] | null` (null = the read failed), `role`, `archived`
 * (an archived group is read-only: no "Deshacer rechazo"), `retryHref`,
 * `actions: Pick<GroupFineActions, "undoRejectPhoto">`, `onUndone?(checkinId)` (optional: the page
 * can refresh; the row is already gone from the list).
 * Absent for members unless `ownerView` (the page passes it when the read gave a member their own rejected photos:
 * the reason is for them, without "Deshacer").
 * Of each rejection: the person (name, @usuario, avatar), the day, the reason, who rejected it.
 */
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { useState } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { plainDayLabel, createRunner } from "../detail/group-logic";
import { ErrorLine, PersonLink } from "../detail/parts";
import { runAndNotify } from "../fund/fund-logic";
import type { GroupRole } from "@/lib/groups-contract";
import type { GroupFineActions, GroupRejectedItem } from "@/lib/groups-fines-contract";

export function RejectedList({
  groupId,
  items,
  role,
  archived,
  retryHref,
  actions,
  onUndone,
  ownerView = false,
}: {
  groupId: string;
  items: GroupRejectedItem[] | null;
  role: GroupRole;
  archived: boolean;
  retryHref: string;
  actions: Pick<GroupFineActions, "undoRejectPhoto">;
  onUndone?: (checkinId: string) => void;
  /** A member reads the reasons of their own rejected photos (the read returns only theirs); no "Deshacer" for them. */
  ownerView?: boolean;
}) {
  const [runner] = useState(createRunner);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [undone, setUndone] = useState<string[]>([]);
  // a refresh hands down a new list: start over from it (adjust state during render)
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    setUndone([]);
  }

  if (role !== "admin" && !ownerView) return null;

  async function undo(checkinId: string) {
    if (runner.busy()) return;
    setPendingId(checkinId);
    setErrors((e) => ({ ...e, [checkinId]: null }));
    const r = await runAndNotify(runner, () => actions.undoRejectPhoto(groupId, checkinId), () => {
      setUndone((u) => [...u, checkinId]);
      onUndone?.(checkinId);
    });
    setPendingId(null);
    if (r && !r.ok) setErrors((e) => ({ ...e, [checkinId]: r.error }));
  }

  const rows = items?.filter((i) => !undone.includes(i.checkinId)) ?? [];
  return (
    <section aria-label="Fotos rechazadas" className="flex flex-col gap-2">
      <SectionHeader label="Fotos rechazadas" />
      {items === null ? (
        <LoadFailed href={retryHref} />
      ) : rows.length === 0 ? (
        <Card className="p-4">
          <p className="text-body text-muted">No hay fotos rechazadas esta semana.</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((i) => (
              <li key={i.checkinId} className="flex flex-col gap-1 px-4 py-2">
                <PersonLink
                  person={i}
                  detail={<span className="truncate text-small text-muted">Foto del {plainDayLabel(i.localDate)}</span>}
                />
                <p className="text-small text-pretty break-words text-ink">{i.reason}</p>
                <p className="truncate text-small text-muted">Rechazó {i.rejectedByName}</p>
                {role === "admin" && !archived ? (
                  <Button
                    variant="ghost"
                    className="h-11! w-auto! self-start px-3!"
                    disabled={pendingId !== null}
                    aria-busy={pendingId === i.checkinId}
                    onClick={() => void undo(i.checkinId)}
                  >
                    <ArrowCounterClockwise size={20} weight="light" aria-hidden />
                    Deshacer rechazo
                  </Button>
                ) : null}
                {errors[i.checkinId] ? <ErrorLine>{errors[i.checkinId]}</ErrorLine> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
