"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Distance between the bottom of the layout viewport and the top of the on-screen
 * keyboard. iOS Safari does not resize the layout viewport for the keyboard, so a
 * `position: fixed; bottom: 0` bar would hide behind it; visualViewport tells us how much.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      setInset(hidden > 80 ? Math.round(hidden) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/** Primary action pinned to the bottom, with safe-area padding, kept above the keyboard. */
export function BottomActionBar({ children }: { children: ReactNode }) {
  const inset = useKeyboardInset();
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-10 bg-paper px-5 pt-2"
      style={{
        transform: inset ? `translateY(-${inset}px)` : undefined,
        paddingBottom: inset ? 8 : "max(env(safe-area-inset-bottom), 16px)",
      }}
    >
      <div className="mx-auto max-w-md">{children}</div>
    </div>
  );
}
