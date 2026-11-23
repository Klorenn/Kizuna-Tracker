"use client";

import { useEffect, useRef, useState } from "react";
import {
  CAT_ASSETS,
  CAT_LOAD_FALLBACK_MS,
  catAnimationStyle,
  catVariantFor,
  startWhenReady,
  type CatAsset,
  type CatVariant,
} from "@/lib/motion/cat-animation";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The owner's animated cat (GIF), tinted through a luminance CSS mask (accent token, so it reads in
 * light and dark) and cropped to the cat's bounding box so `width` is the cat's real width.
 * - prefers-reduced-motion: the mask is the still frame with a 300 ms fade-in (.cat-mask in globals.css).
 * - `variant`: small badges (<= 64 px) default to "still": only the PNG is fetched, never the GIF.
 * - `once`: plays a single pass (the asset's playMs) counted from when the GIF has actually loaded
 *   (1.5 s fallback), then rests on the still frame. `onPlayStart` fires when that pass starts.
 */
export function CatAnimation({
  asset,
  width,
  once = false,
  variant,
  onPlayStart,
  className = "",
}: {
  asset: CatAsset;
  width: number;
  once?: boolean;
  variant?: CatVariant;
  onPlayStart?: () => void;
  className?: string;
}) {
  const kind = variant ?? catVariantFor(width);
  const [rest, setRest] = useState(kind === "still");
  const { playMs, gif } = CAT_ASSETS[asset];
  const onStart = useRef(onPlayStart);
  useEffect(() => {
    onStart.current = onPlayStart;
  });

  useEffect(() => {
    if (!once || kind === "still") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const begin = () => {
      onStart.current?.();
      timer = setTimeout(() => setRest(true), playMs);
    };
    if (reducedMotion()) {
      // only the still frame shows: nothing to wait for
      begin();
      return () => clearTimeout(timer);
    }
    const cancel = startWhenReady(
      (ready) => {
        const img = new Image();
        img.onload = ready;
        img.onerror = ready;
        img.src = gif;
        if (img.complete) ready();
      },
      CAT_LOAD_FALLBACK_MS,
      begin,
    );
    return () => {
      cancel();
      clearTimeout(timer);
    };
  }, [once, kind, playMs, gif]);

  return (
    <span
      aria-hidden="true"
      data-cat={asset}
      data-cat-rest={rest ? "" : undefined}
      className={`cat-mask inline-block shrink-0 bg-accent ${className}`}
      style={catAnimationStyle(asset, width, kind)}
    />
  );
}
