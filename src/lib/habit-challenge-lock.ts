import { untypedDb } from "@/lib/untyped-db";

/**
 * True when a sub-reto that is still live (proposed or active) of an open challenge uses the habit,
 * on either side. Mirror of the database guards (habits_quantity_guard and friends), which read
 * challenge_items the same way: "open" is the item live AND its challenge live, joined.
 */
export async function habitInOpenChallenge(supabase: unknown, habitId: string): Promise<boolean> {
  const { count } = await untypedDb(supabase) // TODO(sub-retos types)
    .from("challenge_items")
    .select("id,challenges!inner(status)", { count: "exact", head: true })
    .in("status", ["proposed", "active"])
    .in("challenges.status", ["proposed", "active"])
    .or(`creator_habit_id.eq.${habitId},rival_habit_id.eq.${habitId}`);
  return (count ?? 0) > 0;
}
