"use client";

import { useEffect, useState } from "react";
import { CAT_LIFT, catLiftStyle } from "@/lib/motion/cat-lift";

/**
 * The owner's animated cat (GIF), tinted through a luminance CSS mask and cropped to the cat's
 * bounding box so `width` is the cat's real width.
 * - prefers-reduced-motion: the mask is the still frame with a 300 ms fade-in (.cat-lift-mask in globals.css).
 * - `once`: plays a single pass (CAT_LIFT.playMs), then rests on the still frame.
 */
export function CatLift({
  width = 172,
  once = false,
  className = "",
}: {
  width?: number;
  once?: boolean;
  className?: string;
}) {
  const [rest, setRest] = useState(false);

  useEffect(() => {
    if (!once) return;
    const t = setTimeout(() => setRest(true), CAT_LIFT.playMs);
    return () => clearTimeout(t);
  }, [once]);

  return (
    <span
      aria-hidden="true"
      data-cat-rest={rest ? "" : undefined}
      className={`cat-lift-mask inline-block shrink-0 bg-accent ${className}`}
      style={catLiftStyle(width)}
    />
  );
}
