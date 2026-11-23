"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./IconButton";

/** Bottom sheet: scrim, grabber, title row with close. */
export function Sheet({
  open,
  title,
  onClose,
  children,
  tall = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Up to 90dvh with a scrollable body (long content such as legal text). */
  tall?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => prev?.focus?.();
  }, [open]);
  if (!open) return null;
  // Portal to body: an ancestor with transform/animation would otherwise become the containing block of `fixed`.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-scrim"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex w-full max-w-md flex-col gap-4 rounded-t-lg text-left outline-none${tall ? " max-h-[90dvh]" : ""} bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card`}
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
        <div className={`flex flex-col gap-4 px-5${tall ? " min-h-0 overflow-y-auto overscroll-contain" : ""}`}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
