"use server";

import { revalidatePath } from "next/cache";
import { parseWeightKg } from "@/domain/body";
import { createServerClient } from "@/lib/supabase/server";

// Private body weight and height. Owner-only: the RPCs read auth.uid() and nothing here
// takes a user id. Never reuse these values in anything another user can see.

type Fail = { ok: false; error: string };

const GENERIC = "No pudimos guardar el cambio. Inténtalo de nuevo.";
const WEIGHT_RANGE = "Escribe un peso entre 20 y 400 kg.";
const HEIGHT_RANGE = "Escribe una altura entre 80 y 250 cm.";

const RPC_ERRORS: Record<string, string> = {
  not_authenticated: "Inicia sesión para continuar.",
  weight_date_future: "No puedes registrar el peso de una fecha futura.",
  weight_date_too_old: "Esa fecha es muy antigua. Elige una de los últimos 5 años.",
  invalid_weight: WEIGHT_RANGE,
  invalid_height: HEIGHT_RANGE,
};

function mapError(message: string): Fail {
  const key = Object.keys(RPC_ERRORS).find((k) => message.includes(k));
  return { ok: false, error: key ? RPC_ERRORS[key] : GENERIC };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A height typed by the user: comma or point, 80 to 250 cm, one decimal. */
function parseHeightCm(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!/^\d{2,3}(\.\d)?$/.test(s)) return null;
  const n = Number(s);
  return n >= 80 && n <= 250 ? n : null;
}

function refresh() {
  revalidatePath("/perfil");
  revalidatePath("/resumen", "layout");
}

/** `date` is a local day (YYYY-MM-DD); omitted means today in the caller's timezone. */
export async function logBodyWeight(input: {
  kg: string | number;
  date?: string;
}): Promise<{ ok: true; id: string } | Fail> {
  const kg = parseWeightKg(String(input.kg));
  if (kg === null) return { ok: false, error: WEIGHT_RANGE };
  if (input.date !== undefined && !isRealDate(input.date)) return { ok: false, error: "Elige una fecha válida." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("log_body_weight", { p_kg: kg, p_date: (input.date ?? null) as string });
  if (error || typeof data !== "string") return mapError(error?.message ?? "");
  refresh();
  return { ok: true, id: data };
}

export async function deleteBodyWeight(id: string): Promise<{ ok: true } | Fail> {
  const gone: Fail = { ok: false, error: "Ese registro ya no existe." };
  if (typeof id !== "string" || !UUID.test(id)) return gone;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("delete_body_weight", { p_id: id });
  if (error) return mapError(error.message);
  if (data !== true) return gone;
  refresh();
  return { ok: true };
}

/** `null` or an empty string clears the height. */
export async function setHeight(cm: string | number | null): Promise<{ ok: true } | Fail> {
  const raw = cm === null ? "" : String(cm);
  let value: number | null = null;
  if (raw.trim() !== "") {
    value = parseHeightCm(raw);
    if (value === null) return { ok: false, error: HEIGHT_RANGE };
  }
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_height", { p_cm: value as number });
  if (error) return mapError(error.message);
  refresh();
  return { ok: true };
}
