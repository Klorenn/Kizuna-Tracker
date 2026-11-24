import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

export type WidgetDevice = { id: string; label: string; createdAt: string; lastUsedAt: string | null };

/**
 * Ajustes > Widget de Android: the person's live devices, oldest first (null = the read failed). Only the columns the
 * `authenticated` role may select: the token hash is never readable (migration 20261127090000).
 */
export async function loadWidgetDevices(supabase: Supabase, userId: string): Promise<WidgetDevice[] | null> {
  const { data, error } = await supabase
    .from("widget_tokens")
    .select("id,label,created_at,last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at");
  if (error || !data) return null;
  return data.map((d) => ({ id: d.id, label: d.label, createdAt: d.created_at, lastUsedAt: d.last_used_at }));
}
