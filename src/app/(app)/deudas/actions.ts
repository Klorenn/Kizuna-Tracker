"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC = "No pudimos completar la acción. Inténtalo de nuevo.";

/** Only the creditor may mark (or unmark) a debt as paid; RLS enforces it too. */
export async function setDebtPaid(
  debtId: string,
  paid: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID.test(debtId)) return { ok: false, error: GENERIC };
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { ok: false, error: "Inicia sesión para continuar." };

  const { data: debt } = await supabase
    .from("debts")
    .select("creditor_id,debtor_id")
    .eq("id", debtId)
    .maybeSingle();
  if (!debt) return { ok: false, error: "Esta deuda ya no existe." };
  if (debt.creditor_id !== uid) return { ok: false, error: "Solo quien cobra puede marcarla como pagada." };

  const { data: rows, error } = await supabase
    .from("debts")
    .update({ paid_at: paid ? new Date().toISOString() : null })
    .eq("id", debtId)
    .eq("creditor_id", uid)
    .select("id");
  if (error || !rows || rows.length === 0) return { ok: false, error: GENERIC };
  revalidatePath("/deudas");
  revalidatePath("/retos");
  revalidatePath("/retos/[id]", "page");
  return { ok: true };
}
