import { avatarUrl } from "@/lib/avatar";
import { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

export const PAGE_SIZE = 20;
export const SUGGESTION_COUNT = 3;
/**
 * Amigos asks for the function's maximum (50) and shows the first few: people with a pending request already appear under
 * Solicitudes / Enviadas, so the suggestions skip them without costing a second round trip.
 */
export const SUGGESTION_POOL = 50;

export const SHORT_QUERY_COPY = "Escribe al menos 2 letras.";
export const LONG_QUERY_COPY = "Esa búsqueda es demasiado larga.";
export const LOAD_PEOPLE_COPY = "No pudimos cargar a las personas. Inténtalo de nuevo.";
export const REQUEST_LIMIT_COPY = "Tienes 20 solicitudes sin responder. Cancela alguna para enviar más.";

export type Relation = "none" | "outgoing" | "incoming";

/** One row of Amigos > Sugerencias or Explorar: only what discover_people returns, nothing else about the person. */
export type Person = {
  id: string;
  username: string;
  displayName: string;
  avatarSrc: string | null;
  avatarPreset: number | null;
  mutualCount: number;
  relation: Relation;
  isNew: boolean;
};

export type QueryCheck = { kind: "none" } | { kind: "ok"; q: string } | { kind: "short" } | { kind: "long" };

/**
 * The same normalisation the database applies: trim, drop one leading @, lower-case. Empty means
 * "no query"; under 2 or over 40 characters is refused here so it never costs a round trip.
 */
export function normalizeQuery(raw: unknown): QueryCheck {
  if (typeof raw !== "string") return { kind: "none" };
  const q = raw.trim().replace(/^@/, "").trim().toLowerCase();
  if (q === "") return { kind: "none" };
  if (q.length < 2) return { kind: "short" };
  if (q.length > 40) return { kind: "long" };
  return { kind: "ok", q };
}

export type LoadPeopleResult = { ok: true; people: Person[]; hasMore: boolean } | { ok: false; error: string };

type DiscoverRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  avatar_preset: number | null;
  mutual_count: number;
  relation: string;
  is_new: boolean;
};

function toPerson(r: DiscoverRow): Person {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarSrc: avatarUrl(r.avatar_path),
    avatarPreset: r.avatar_preset,
    mutualCount: r.mutual_count,
    relation: r.relation === "outgoing" || r.relation === "incoming" ? r.relation : "none",
    isNew: r.is_new,
  };
}

/**
 * One page of discover_people. Asks for limit + 1 rows to know whether there is more. A failed
 * call is an error state, never an empty list.
 */
export async function loadPeople(input: {
  query: string | null;
  offset: number;
  limit: number;
  /** A client the caller already has (a server action that just checked the session). */
  client?: Supabase;
}): Promise<LoadPeopleResult> {
  const check = normalizeQuery(input.query);
  if (check.kind === "short") return { ok: false, error: SHORT_QUERY_COPY };
  if (check.kind === "long") return { ok: false, error: LONG_QUERY_COPY };
  try {
    const supabase = input.client ?? (await createServerClient());
    const args = {
      ...(check.kind === "ok" ? { p_query: check.q } : {}),
      p_limit: input.limit + 1,
      p_offset: input.offset,
    };
    const { data, error } = await supabase.rpc("discover_people", args);
    if (error) {
      if (error.message?.includes("invalid_query")) return { ok: false, error: SHORT_QUERY_COPY };
      return { ok: false, error: LOAD_PEOPLE_COPY };
    }
    const rows = (data ?? []) as DiscoverRow[];
    return { ok: true, people: rows.slice(0, input.limit).map(toPerson), hasMore: rows.length > input.limit };
  } catch {
    return { ok: false, error: LOAD_PEOPLE_COPY };
  }
}

/** The viewer's own switch. `null` when the read failed (the page then hides the switch instead of guessing). */
export async function loadDiscoverable(supabase: Supabase, userId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from("profiles").select("discoverable").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return data.discoverable;
}

/** Ajustes > Notificaciones: the two opt-out switches (null = the read failed). */
export async function loadNotifyPrefs(supabase: Supabase, userId: string): Promise<{ streakRisk: boolean; weeklySummary: boolean } | null> {
  const { data, error } = await supabase.from("profiles").select("notify_streak_risk,notify_weekly_summary").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return { streakRisk: data.notify_streak_risk, weeklySummary: data.notify_weekly_summary };
}
