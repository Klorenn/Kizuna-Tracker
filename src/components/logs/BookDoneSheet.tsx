"use client";

import { CelebrationSheet } from "@/components/CelebrationSheet";

/** "Terminaste Dune" with the jumping cat, one pass. */
export function BookDoneSheet({ open, title, onClose }: { open: boolean; title: string; onClose: () => void }) {
  return (
    <CelebrationSheet open={open} title={`Terminaste ${title}`} asset="jump" onClose={onClose}>
      <p className="text-body text-muted">Lo pasamos a tus libros terminados.</p>
    </CelebrationSheet>
  );
}
