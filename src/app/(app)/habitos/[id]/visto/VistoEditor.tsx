"use client";

import type { PickerMedia } from "@/app/(app)/series/media-data";
import { WatchForm, type WatchEntryValues } from "@/components/logs/WatchSheet";
import { Card } from "@/components/ui/Card";
import { Toast, useToast } from "@/components/ui/Toast";

/** The watch form of one day's check-in, on its own page. Saving refreshes the page. */
export function VistoEditor({
  checkinId,
  media,
  entry,
  formKey,
}: {
  checkinId: string;
  media: PickerMedia[];
  entry: WatchEntryValues | null;
  /** changes when the saved entry changes, so the form restarts from it (the toast survives) */
  formKey: string;
}) {
  const [toast, showToast] = useToast();
  return (
    <>
      <Card className="p-4">
        <WatchForm
          key={formKey}
          mode={{ kind: "edit", checkinId, entry }}
          media={media}
          onFinished={() => {}}
          onSaved={showToast}
        />
      </Card>
      <Toast message={toast} />
    </>
  );
}
