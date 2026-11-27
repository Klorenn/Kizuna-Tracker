"use client";

import dynamic from "next/dynamic";

export const OutingMapLazy = dynamic(() => import("@/components/map/OutingMap").then((m) => m.OutingMap), {
  ssr: false,
});
