import "server-only";
import type { WeightEntry } from "@/domain/body";
import type { LocalDate } from "@/domain/types";
import type { createServerClient } from "@/lib/supabase/server";

// Private body weight reads. Always the caller's own rows (RLS enforces it, `user_id = uid` is
// repeated on purpose). Nothing here may be called with another user's id or reused by a
// friend, public profile, feed or challenge view.

type Client = Awaited<ReturnType<typeof createServerClient>>;

export type WeightRow = { id: string; date: LocalDate; kg: number };

/**
 * The API caps a query at 1000 rows. Three pages (3000 rows) hold 8 years of daily entries;
 * "Todo" stops there and shows the newest 3000.
 */
const PAGE = 1000;
const MAX_PAGES = 3;

type Raw = { id: string; measured_on: string; weight_kg: number };
const toRow = (r: Raw): WeightRow => ({ id: r.id, date: r.measured_on, kg: Number(r.weight_kg) });

/** A failed read is reported, never shown as "no entries" (that would invite a duplicate entry). */
export type Loaded<T> = ({ ok: true } & T) | { ok: false };

/** The latest `limit` entries, newest first. */
export async function loadRecentWeights(
  supabase: Client,
  uid: string,
  limit: number,
): Promise<Loaded<{ rows: WeightRow[] }>> {
  const { data, error } = await supabase
    .from("body_weights")
    .select("id,measured_on,weight_kg")
    .eq("user_id", uid)
    .order("measured_on", { ascending: false })
    .limit(limit);
  if (error || !data) return { ok: false };
  return { ok: true, rows: data.map(toRow) };
}

/**
 * Entries from `from` (inclusive; null = all of them) newest first, in pages, plus the last
 * entry before `from` so the first month of the range still has something to compare with.
 */
export async function loadWeights(
  supabase: Client,
  uid: string,
  from: LocalDate | null,
): Promise<Loaded<{ rows: WeightRow[]; before: WeightEntry | null }>> {
  const rows: WeightRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = supabase.from("body_weights").select("id,measured_on,weight_kg").eq("user_id", uid);
    if (from) q = q.gte("measured_on", from);
    const { data, error } = await q
      .order("measured_on", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error || !data) return { ok: false };
    const got = data.map(toRow);
    rows.push(...got);
    if (got.length < PAGE) break;
  }

  let before: WeightEntry | null = null;
  if (from) {
    const { data, error } = await supabase
      .from("body_weights")
      .select("id,measured_on,weight_kg")
      .eq("user_id", uid)
      .lt("measured_on", from)
      .order("measured_on", { ascending: false })
      .limit(1);
    if (error) return { ok: false };
    const r = data?.[0];
    if (r) before = { date: r.measured_on, kg: Number(r.weight_kg) };
  }
  return { ok: true, rows, before };
}
