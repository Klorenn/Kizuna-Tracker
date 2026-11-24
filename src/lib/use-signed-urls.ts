"use client";

import { useEffect, useState } from "react";
import { mergeSignedUrls, PROOF_SIGNED_SECONDS } from "@/lib/signed-url-state";
import { createBrowserClient } from "@/lib/supabase/client";

/** Signed URLs last PROOF_SIGNED_SECONDS (300 s); reuse them for at most 240 s. */
const REUSE_MS = 240_000;
const cache = new Map<string, { url: string; at: number }>();

const fresh = (path: string, now = Date.now()) => {
  const hit = cache.get(path);
  return hit && now - hit.at < REUSE_MS ? hit : null;
};

/** Puts URLs the server signed at `signedAt` in the cache with that age (so `fresh()` decides if they are still usable). */
export function seedCache(seed: Record<string, string>, signedAt: number) {
  for (const [p, url] of Object.entries(seed)) {
    const hit = cache.get(p);
    if (!hit || hit.at < signedAt) cache.set(p, { url, at: signedAt });
  }
}

/** Which paths are usable from the cache and which must be signed in the browser. */
export function planSigning(paths: string[], now = Date.now()) {
  const known: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    const hit = fresh(p, now);
    if (hit) known[p] = hit.url;
    else missing.push(p);
  }
  return { known, missing };
}

/** Test helper. */
export function _resetSignedCache() {
  cache.clear();
}

/** Re-signs ONE path in the browser (an <img> failed to load: expired URL). Null when it cannot be signed. */
export async function resignProof(path: string): Promise<string | null> {
  try {
    const { data } = await createBrowserClient().storage.from("proofs").createSignedUrls([path], PROOF_SIGNED_SECONDS);
    const row = data?.find((d) => d.path === path);
    const url = row && !row.error && row.signedUrl ? row.signedUrl : null;
    if (url) cache.set(path, { url, at: Date.now() });
    return url;
  } catch {
    return null;
  }
}

/**
 * Signs proof photo paths with the user's own session (storage RLS decides what is readable).
 * Value per path: undefined while loading, null when it could not be signed.
 * `seed` + `signedAt`: URLs the server signed at that time (in the initial HTML). They are used only while younger than
 * REUSE_MS (a page restored from the back/forward cache may be older); otherwise, and for paths the seed lacks (e.g. pages
 * added by "Ver más"), they are signed in the browser.
 */
export function useSignedUrls(
  paths: string[],
  seed?: Record<string, string>,
  signedAt?: number,
): Record<string, string | null | undefined> {
  const key = [...new Set(paths)].sort().join("|");
  const [urls, setUrls] = useState<Record<string, string | null>>(() => {
    const init: Record<string, string | null> = {};
    if (seed && signedAt !== undefined && Date.now() - signedAt < REUSE_MS) {
      for (const p of paths) if (seed[p]) init[p] = seed[p];
    }
    return init;
  });

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (seed && signedAt !== undefined) seedCache(seed, signedAt);
    const { known, missing } = planSigning(list);
    // keep what is already on screen while the rest signs (no flash back to "loading")
    setUrls((prev) => mergeSignedUrls(prev, list, known));
    if (missing.length === 0) return;
    let live = true;
    createBrowserClient()
      .storage.from("proofs")
      .createSignedUrls(missing, PROOF_SIGNED_SECONDS)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `seed` is only a starting point; `key` drives re-signing
  }, [key]);

  return urls;
}
