"use client";

import { CatAnimation } from "./CatAnimation";

/** The lifting cat (gym). Thin wrapper over CatAnimation; see there for `once` and reduced motion. */
export function CatLift({
  width = 172,
  once = false,
  className = "",
}: {
  width?: number;
  once?: boolean;
  className?: string;
}) {
  return <CatAnimation asset="lift" width={width} once={once} className={className} />;
}
