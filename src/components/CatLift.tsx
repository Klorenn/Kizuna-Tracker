"use client";

import { useEffect, useState } from "react";
import { CAT_LIFT, catMask, type CatState } from "@/lib/motion/cat-lift";

const SIZE = { lg: 160, sm: 112 } as const;

/**
 * The owner's lifting cat. The GIF is white on transparent, so it is used as a mask over
 * an accent background: the silhouette turns indigo and the cut-outs show the sheet.
 * Plays once on mount, then rests on frame 0. With prefers-reduced-motion it never plays.
 */
export function CatLift({ size = "lg" }: { size?: keyof typeof SIZE }) {
  const [state, setState] = useState<CatState>("playing");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState("reduced");
      return;
    }
    // the GIF loops forever by itself: stop after one pass (design: no looping motion)
    const t = setTimeout(() => setState("rest"), CAT_LIFT.playMs);
    return () => clearTimeout(t);
  }, []);

  const px = SIZE[size];
  return (
    <div
      aria-hidden
      data-cat-state={state}
      className={`shrink-0 bg-accent ${state === "reduced" ? "cat-fade" : ""}`}
      style={{
        width: px,
        height: px,
        WebkitMaskImage: catMask(state).maskImage,
        WebkitMaskSize: catMask(state).maskSize,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: catMask(state).maskPosition,
        ...catMask(state),
      }}
    />
  );
}
