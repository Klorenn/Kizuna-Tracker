"use client";

import { CatAnimation } from "./CatAnimation";

/** The jumping cat (joyful moments). Thin wrapper over CatAnimation. */
export function CatJump({
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
  return <CatAnimation asset="jump" width={width} once={once} onPlayStart={onPlayStart} className={className} />;
}
