"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function markAllRead(): Promise<Result> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Inicia sesión para continuar." };
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", data.user.id)
    .is("read_at", null);
  if (error) return { ok: false, error: "No pudimos completar la acción. Inténtalo de nuevo." };
  revalidatePath("/", "layout");
  return { ok: true };
}
