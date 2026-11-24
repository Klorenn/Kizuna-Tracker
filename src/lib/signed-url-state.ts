/**
 * Next state of useSignedUrls for a new list of paths: fresh cached URLs win, URLs already on
 * screen stay while their replacements load (no flicker), failures are dropped so they retry.
 */
export function mergeSignedUrls(
  prev: Record<string, string | null>,
  paths: string[],
  known: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of paths) {
    const url = known[p] ?? prev[p]
    if (url) out[p] = url
  }
  return out
}

/** Signed URLs for the private `proofs` bucket last 300 s (server and browser signing share it). */
export const PROOF_SIGNED_SECONDS = 300
