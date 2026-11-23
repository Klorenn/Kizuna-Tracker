"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/** Signed URLs for the private `proofs` bucket last 300 s; reuse them for at most 240 s. */
const SIGNED_SECONDS = 300;
const REUSE_MS = 240_000;
const cache = new Map<string, { url: string; at: number }>();

const fresh = (path: string) => {
  const hit = cache.get(path);
  return hit && Date.now() - hit.at < REUSE_MS ? hit : null;
};

/**
 * Signs proof photo paths with the user's own session (storage RLS decides what is readable).
 * Value per path: undefined while loading, null when it could not be signed.
 */
export function useSignedUrls(paths: string[]): Record<string, string | null | undefined> {
  const key = [...new Set(paths)].sort().join("|");
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const list = key ? key.split("|") : [];
    const known: Record<string, string | null> = {};
    const missing: string[] = [];
    for (const p of list) {
      const hit = fresh(p);
      if (hit) known[p] = hit.url;
      else missing.push(p);
    }
    setUrls(known);
    if (missing.length === 0) return;
    let live = true;
    createBrowserClient()
      .storage.from("proofs")
      .createSignedUrls(missing, SIGNED_SECONDS)
      .then(({ data }) => {
        const now = Date.now();
        const got: Record<string, string | null> = {};
        for (const p of missing) {
          const row = data?.find((d) => d.path === p);
          const url = row && !row.error && row.signedUrl ? row.signedUrl : null;
          got[p] = url;
          // failures are not cached: the next open tries again
          if (url) cache.set(p, { url, at: now });
        }
        if (live) setUrls((prev) => ({ ...prev, ...got }));
      })
      .catch(() => {
        if (live) setUrls((prev) => ({ ...prev, ...Object.fromEntries(missing.map((p) => [p, null])) }));
      });
    return () => {
      live = false;
    };
  }, [key]);

  return urls;
}
