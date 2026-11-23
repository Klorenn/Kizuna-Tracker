"use client";

import { CatAnimation } from "./CatAnimation";

/** The jumping cat (joyful moments). Thin wrapper over CatAnimation. */
export function CatJump({
  width = 112,
  once = false,
  className = "",
}: {
  width?: number;
  once?: boolean;
  className?: string;
}) {
  return <CatAnimation asset="jump" width={width} once={once} className={className} />;
}
