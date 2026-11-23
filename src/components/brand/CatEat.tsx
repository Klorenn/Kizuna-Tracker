"use client";

import { CatAnimation } from "./CatAnimation";

/** The eating cat (food moments). Thin wrapper over CatAnimation. */
export function CatEat({
  width = 112,
  once = false,
  onPlayStart,
  className = "",
}: {
  width?: number;
  once?: boolean;
  /** `once` only: the single pass started (the GIF loaded). */
  onPlayStart?: () => void;
  className?: string;
}) {
  return <CatAnimation asset="eat" width={width} once={once} onPlayStart={onPlayStart} className={className} />;
}
