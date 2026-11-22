"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useEffect, type ReactNode } from "react";
import { IconButton } from "./IconButton";

/** Bottom sheet: scrim, grabber, title row with close. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/35"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex w-full max-w-md flex-col gap-4 rounded-t-lg bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="flex flex-col items-center gap-2 pt-2">
          <span aria-hidden className="h-[5px] w-9 rounded-[3px] bg-line" />
          <div className="flex w-full items-center gap-2 pl-5 pr-2">
            <h2 className="flex-1 text-title font-semibold text-ink">{title}</h2>
            <IconButton label="Cerrar" onClick={onClose}>
              <X size={20} weight="light" aria-hidden />
            </IconButton>
          </div>
        </div>
        <div className="flex flex-col gap-4 px-5">{children}</div>
      </div>
    </div>
  );
}
