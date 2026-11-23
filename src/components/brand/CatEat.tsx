"use client";

import { CatAnimation } from "./CatAnimation";

/** The eating cat (food moments). Thin wrapper over CatAnimation. */
export function CatEat({
  width = 112,
  once = false,
  className = "",
}: {
  width?: number;
  once?: boolean;
  className?: string;
}) {
  return <CatAnimation asset="eat" width={width} once={once} className={className} />;
}
