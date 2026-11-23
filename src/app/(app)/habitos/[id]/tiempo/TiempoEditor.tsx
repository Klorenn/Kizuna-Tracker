"use client";

import { useState } from "react";
import { TimeForm } from "@/components/logs/TimeSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toast, useToast } from "@/components/ui/Toast";

/**
 * The time of one day on its own page. With a check-in the form edits (set_time_entry); today
 * without one adds (add_time creates the check-in). After deleting, the empty state offers to add
 * again.
 */
export function TiempoEditor({
  habitId,
  preset,
  checkinId,
  entry,
}: {
  habitId: string;
  preset: string | null;
  checkinId: string | null;
  entry: { minutes: number; topic: string | null } | null;
}) {
  const [toast, showToast] = useToast();
  const [adding, setAdding] = useState(false);
  const empty = checkinId !== null && entry === null && !adding;
  return (
    <>
      {empty ? (
        <Card>
          <EmptyState
            title="Sin registro de tiempo"
            body="Este día está cumplido, pero no anotaste cuánto rato."
            action={
              <Button variant="secondary" onClick={() => setAdding(true)} className="w-auto!">
                Añadir tiempo
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="p-4">
          <TimeForm
            mode={
              checkinId === null
                ? { kind: "add", habitId }
                : { kind: "edit", checkinId, entry }
            }
            preset={preset}
            onFinished={() => setAdding(false)}
            onSaved={showToast}
          />
        </Card>
      )}
      <Toast message={toast} />
    </>
  );
}
