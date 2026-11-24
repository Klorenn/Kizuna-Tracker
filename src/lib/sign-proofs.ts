import type { SupabaseClient } from "@supabase/supabase-js";
import { PROOF_SIGNED_SECONDS } from "@/lib/signed-url-state";

export { PROOF_SIGNED_SECONDS };

/**
 * Server side: signs proof photo paths in ONE `createSignedUrls` call with the caller's own (user-scoped) client, so the
 * storage RLS policy still decides what is readable. Paths that cannot be signed are left out (the browser hook retries
 * them); a failure never throws.
 */
export async function signProofUrls(
  supabase: Pick<SupabaseClient, "storage">,
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return {};
  try {
    const { data } = await supabase.storage.from("proofs").createSignedUrls(unique, PROOF_SIGNED_SECONDS);
    const out: Record<string, string> = {};
    for (const row of data ?? []) if (row.path && !row.error && row.signedUrl) out[row.path] = row.signedUrl;
    return out;
  } catch {
    return {};
  }
}
