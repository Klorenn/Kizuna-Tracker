"use client";

import { useEffect } from "react";
import { CAT_ASSETS, shouldPreloadCats, type CatAsset } from "@/lib/motion/cat-animation";

/**
 * Warms the HTTP cache with the cat GIFs this screen may celebrate with, when the browser is idle,
 * so the celebration sheet starts its pass right away. Skipped under reduced motion (still frame
 * only) and Save-Data. Renders nothing.
 */
export function CatPreload({ assets }: { assets: CatAsset[] }) {
  const key = assets.join(",");
  useEffect(() => {
    if (!key) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const ok = shouldPreloadCats({
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      saveData: connection?.saveData === true,
    });
    if (!ok) return;
    const load = () => {
      for (const a of key.split(",") as CatAsset[]) {
        const img = new Image();
        img.src = CAT_ASSETS[a].gif;
      }
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(load, 1500);
    return () => clearTimeout(t);
  }, [key]);
  return null;
}
