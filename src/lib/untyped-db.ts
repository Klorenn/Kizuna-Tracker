import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * challenge_items / challenge_item_results are not in the generated types yet.
 * TODO(sub-retos types): regenerate database.types.ts (Batch 6) and delete this helper.
 */
export const untypedDb = (db: unknown) => db as SupabaseClient;
