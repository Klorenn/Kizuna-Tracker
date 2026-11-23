"use client";

import { ReadingForm } from "@/components/logs/ReadingSheet";
import { Card } from "@/components/ui/Card";
import { Toast, useToast } from "@/components/ui/Toast";
import type { PickerBook } from "@/lib/reading-books";

/** The reading form of one day's check-in, on its own page. Saving refreshes the page (no cat). */
export function LecturaEditor({
  checkinId,
  books,
  entry,
}: {
  checkinId: string;
  books: PickerBook[];
  entry: { bookId: string; fromPage: number; toPage: number } | null;
}) {
  const [toast, showToast] = useToast();
  return (
    <>
      <Card className="p-4">
        <ReadingForm mode={{ kind: "edit", checkinId, entry }} books={books} onFinished={() => {}} onSaved={showToast} />
      </Card>
      <Toast message={toast} />
    </>
  );
}
