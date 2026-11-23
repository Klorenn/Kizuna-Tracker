"use client";

import dynamic from "next/dynamic";

/** The strip reads localStorage, so it never renders on the server: its code loads after first paint. */
export const PomodoroBannerLazy = dynamic(
  () => import("./logs/PomodoroBanner").then((m) => m.PomodoroBanner),
  { ssr: false },
);
