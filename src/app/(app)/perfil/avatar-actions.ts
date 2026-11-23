"use server";

import { revalidatePath } from "next/cache";
import { isAvatarPreset } from "@/lib/avatar-presets";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const LOGIN = "Inicia sesión para continuar.";

async function currentUserId() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, uid: data.user?.id ?? null };
}

/** Picks one of the eight bundled cats. Goes through the definer RPC: clients cannot UPDATE the column. */
export async function setAvatarPreset(preset: number): Promise<Result> {
  if (!isAvatarPreset(preset)) return { ok: false, error: "Elige uno de los avatares." };
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: LOGIN };
  const { error } = await supabase.rpc("set_avatar_preset", { p_preset: preset });
  if (error) return { ok: false, error: "No pudimos guardar el avatar. Inténtalo de nuevo." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Removes the uploaded photo (service role, like the upload) so the preset shows again. */
export async function removeAvatar(): Promise<Result> {
  const { uid } = await currentUserId();
  if (!uid) return { ok: false, error: LOGIN };
  const admin = createAdminClient();
  // clear the pointer first: a leftover file in the bucket is harmless, a dangling pointer is not
  const { error } = await admin.from("profiles").update({ avatar_path: null, avatar_updated_at: null }).eq("id", uid);
  if (error) return { ok: false, error: "No pudimos quitar la foto. Inténtalo de nuevo." };
  await admin.storage.from("avatars").remove([`${uid}.jpg`]);
  revalidatePath("/", "layout");
  return { ok: true };
}
