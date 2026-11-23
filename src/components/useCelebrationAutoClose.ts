"use client";

import { useCallback, useEffect, useRef } from "react";
import { celebrationAutoCloseMs } from "@/lib/celebrate-once";
import type { CatAsset } from "@/lib/motion/cat-animation";

/**
 * Auto-close for celebration sheets: `start` (wired to the cat's onPlayStart, i.e. once its GIF
 * has loaded) closes the sheet after one full pass + 500 ms; `cancel` (any interaction) keeps it open.
 */
export function useCelebrationAutoClose(open: boolean, onClose: () => void, asset: CatAsset) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const cancel = useCallback(() => {
    cancelled.current = true;
    clear();
  }, []);

  const start = useCallback(() => {
    if (cancelled.current || timer.current) return;
    timer.current = setTimeout(() => close.current(), celebrationAutoCloseMs(asset));
  }, [asset]);

  useEffect(() => {
    if (!open) return;
    return () => {
      clear();
      // reset on close (not on open): the cat may start its pass before this effect runs
      cancelled.current = false;
    };
  }, [open]);

  return { start, cancel };
}
