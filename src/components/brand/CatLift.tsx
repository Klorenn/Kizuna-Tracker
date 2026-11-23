"use client";

import { CatAnimation } from "./CatAnimation";

/** The lifting cat (gym). Thin wrapper over CatAnimation; see there for `once` and reduced motion. */
export function CatLift({
  width = 172,
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
  return <CatAnimation asset="lift" width={width} once={once} onPlayStart={onPlayStart} className={className} />;
}
