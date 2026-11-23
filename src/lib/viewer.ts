import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";

export type Viewer = { id: string; timezone: string; deletedAt: string | null };

type Client = Awaited<ReturnType<typeof createServerClient>>;

/**
 * The verified user of this request. The id comes from the JWT claims (checked locally against the
 * cached JWKS, no Auth round trip); the profile read adds the timezone and the deleted flag.
 * Returns null when there is no verified session or no profile row.
 */
export async function loadViewer(supabase: Client): Promise<Viewer | null> {
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,timezone,deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return null;
  return { id: profile.id, timezone: profile.timezone, deletedAt: profile.deleted_at };
}

/** Per-request memoised: any number of server components and helpers share one verification and one profile read. */
export const getViewer = cache(async (): Promise<Viewer | null> => loadViewer(await createServerClient()));
