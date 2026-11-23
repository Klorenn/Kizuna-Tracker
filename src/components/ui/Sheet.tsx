"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { createModalStack, createScrollLock, trapTarget } from "@/lib/modal-stack";
import { IconButton } from "./IconButton";

/** Every open sheet, in opening order: only the top one answers Escape, its backdrop and Tab. */
const stack = createModalStack();
/** Body scroll lock shared by all sheets (ref-counted, so nested sheets release it once). */
const lockScroll = createScrollLock(() => document.body.style);

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet: scrim, grabber, title row with close. A real modal: Tab stays inside, the page
 * behind does not scroll, Escape and the backdrop close only the topmost sheet, and focus goes
 * back on close (to `returnFocusRef` when given: Safari does not focus buttons on tap).
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  tall = false,
  returnFocusRef,
  initialFocusRef,
  describedBy,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Up to 90dvh with a scrollable body (long content such as legal text). */
  tall?: boolean;
  /** Element that gets focus back when the sheet closes (default: whatever had focus when it opened). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Element focused when the sheet opens (default: the dialog itself). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Id of the element that describes the dialog (aria-describedby). */
  describedBy?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  // latest values without re-running the open/close effect
  const onCloseRef = useRef(onClose);
  const returnRef = useRef(returnFocusRef);
  const initialRef = useRef(initialFocusRef);
  useEffect(() => {
    onCloseRef.current = onClose;
    returnRef.current = returnFocusRef;
    initialRef.current = initialFocusRef;
  });

  // Portal only after mount: the server render (and the first client render) never touch `document`.
  useEffect(() => setMounted(true), []);

  const active = open && mounted;

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const id = stack.open();
    const release = lockScroll();
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initialRef.current?.current ?? dialog).focus();

    const onKey = (e: KeyboardEvent) => {
      if (!stack.isTop(id)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = trapTarget(items, current, e.shiftKey);
      if (target) {
        e.preventDefault();
        target.focus();
      } else if (items.length === 0) {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      stack.close(id);
      release();
      const back = returnRef.current?.current ?? previous;
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, [active]);

  if (!active) return null;
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
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        className={`relative flex w-full max-w-md flex-col gap-4 rounded-t-lg text-left outline-none${tall ? " max-h-[90dvh]" : ""} bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card`}
      >
        <div className="flex flex-col items-center gap-2 pt-2">
          <span aria-hidden className="h-[5px] w-9 rounded-[3px] bg-line" />
          <div className="flex w-full items-center gap-2 pl-5 pr-2">
            <h2 id={titleId} className="flex-1 text-title font-semibold text-ink">
              {title}
            </h2>
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
