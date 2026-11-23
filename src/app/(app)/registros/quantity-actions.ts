"use server";

import { revalidatePath } from "next/cache";
import { QUANTITY_MESSAGES } from "@/lib/quantity-queue";
import { createServerClient } from "@/lib/supabase/server";

type Totals = { total: number; target: number; done: boolean };

export type AddQuantityResult = ({ ok: true } & Totals) | { ok: false; error: string; retry: boolean };
export type RemoveQuantityResult = ({ ok: true } & Totals) | { ok: false; error: string };

const GENERIC = "No pudimos guardar la cantidad. Inténtalo de nuevo.";

const ERRORS: Record<string, string> = {
  invalid_amount: "Revisa la cantidad.",
  amount_over_day: "Es demasiado para un día.",
  entry_not_today: "Solo puedes quitar lo de hoy.",
  entry_not_found: QUANTITY_MESSAGES.notFound,
  invalid_entry: "No pudimos guardar esa suma.",
  habit_not_found: "No encontramos ese hábito.",
  log_type_mismatch: "Este hábito ya no es de cantidad.",
  habit_in_challenge: "Este hábito está en un reto: puedes subir la meta, no bajarla ni cambiar la unidad.",
  not_authenticated: "Inicia sesión para continuar.",
};

const NETWORK = /fetch|network|failed to fetch|econn|timeout|load failed/i;

type DbError = { message?: string; code?: string } | null | undefined;

function isNetwork(error: DbError): boolean {
  const raw = error?.message ?? "";
  return !Object.keys(ERRORS).some((k) => raw.includes(k)) && NETWORK.test(raw);
}

function messageFor(error: DbError): string {
  const raw = error?.message ?? "";
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : GENERIC;
}

type Row = { total: number | string; target: number | string; done: boolean };

function totalsOf(data: unknown): Totals | null {
  const row = (Array.isArray(data) ? data[0] : data) as Row | null | undefined;
  if (!row) return null;
  const total = Number(row.total);
  const target = Number(row.target);
  if (!Number.isFinite(total) || !Number.isFinite(target)) return null;
  return { total, target, done: Boolean(row.done) };
}

/**
 * Refreshes the pages that show quantity totals. The client calls it once when its queue drains or
 * its sheet closes, never per tap (a burst of taps would re-render all of Hoy each time).
 */
export async function refreshQuantity(): Promise<void> {
  revalidatePath("/");
  revalidatePath("/habitos/[id]", "page");
  revalidatePath("/resumen");
}

/**
 * Adds one sum to today's total. Idempotent by `entryId` (a UUID the client keeps across retries):
 * `retry: true` means nothing was confirmed (network) and the same call can be repeated safely.
 */
export async function addQuantity(habitId: string, entryId: string, amount: number): Promise<AddQuantityResult> {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: ERRORS.invalid_amount, retry: false };
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("add_quantity_entry", {
      p_habit_id: habitId,
      p_entry_id: entryId,
      p_amount: amount,
    });
    if (error) {
      return isNetwork(error)
        ? { ok: false, error: QUANTITY_MESSAGES.offlineAdd, retry: true }
        : { ok: false, error: messageFor(error), retry: false };
    }
    const totals = totalsOf(data);
    if (!totals) return { ok: false, error: GENERIC, retry: false };
    return { ok: true, ...totals };
  } catch {
    return { ok: false, error: QUANTITY_MESSAGES.offlineAdd, retry: true };
  }
}

/** Removes one of today's sums; the check-in goes away when the total drops under the goal. */
export async function removeQuantity(entryId: string): Promise<RemoveQuantityResult> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("remove_quantity_entry", { p_entry_id: entryId });
    if (error) return { ok: false, error: isNetwork(error) ? QUANTITY_MESSAGES.offlineRemove : messageFor(error) };
    const totals = totalsOf(data);
    if (!totals) return { ok: false, error: GENERIC };
    return { ok: true, ...totals };
  } catch {
    return { ok: false, error: QUANTITY_MESSAGES.offlineRemove };
  }
}
