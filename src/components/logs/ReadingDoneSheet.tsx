"use client";

import { CelebrationSheet } from "@/components/CelebrationSheet";

/** "Lectura registrada" with the reading cat, one pass. */
export function ReadingDoneSheet({ open, pages, onClose }: { open: boolean; pages: number; onClose: () => void }) {
  return (
    <CelebrationSheet open={open} title="Lectura registrada" asset="read" onClose={onClose}>
      <p className="font-mono text-[17px] font-medium text-ink">
        {pages} {pages === 1 ? "página" : "páginas"}
      </p>
      <p className="text-body text-muted">Quedó en tu lectura de hoy.</p>
    </CelebrationSheet>
  );
}
