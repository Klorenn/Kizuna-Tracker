"use client";

import { useEffect, useState } from "react";
import { CAT_ASSETS, catAnimationStyle, type CatAsset } from "@/lib/motion/cat-animation";

/**
 * The owner's animated cat (GIF), tinted through a luminance CSS mask (accent token, so it reads in
 * light and dark) and cropped to the cat's bounding box so `width` is the cat's real width.
 * - prefers-reduced-motion: the mask is the still frame with a 300 ms fade-in (.cat-mask in globals.css).
 * - `once`: plays a single pass (the asset's playMs), then rests on the still frame.
 */
export function CatAnimation({
  asset,
  width,
  once = false,
  className = "",
}: {
  asset: CatAsset;
  width: number;
  once?: boolean;
  className?: string;
}) {
  const [rest, setRest] = useState(false);
  const playMs = CAT_ASSETS[asset].playMs;

  useEffect(() => {
    if (!once) return;
    const t = setTimeout(() => setRest(true), playMs);
    return () => clearTimeout(t);
  }, [once, playMs]);

  return (
    <span
      aria-hidden="true"
      data-cat={asset}
      data-cat-rest={rest ? "" : undefined}
      className={`cat-mask inline-block shrink-0 bg-accent ${className}`}
      style={catAnimationStyle(asset, width)}
    />
  );
}
