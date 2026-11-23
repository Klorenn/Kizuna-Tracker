"use server";

import { revalidatePath } from "next/cache";
import { deleteAccountWith } from "@/lib/delete-account";
import { supabaseDeleteDeps } from "@/lib/delete-account-deps";
import { processAvatar } from "@/lib/avatar";
import { requireUser } from "@/lib/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
const LOGIN = "Inicia sesión para continuar.";

async function currentUserId(): Promise<{ supabase: Awaited<ReturnType<typeof createServerClient>>; uid: string | null }> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, uid: data.user?.id ?? null };
}

export async function updateSettings(input: {
  firstName: string;
  lastName: string;
  reminderTime: string;
}): Promise<Result> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (firstName.length < 1 || firstName.length > 40) return { ok: false, error: "Escribe tu nombre (hasta 40 letras)." };
  if (lastName.length < 1 || lastName.length > 40) return { ok: false, error: "Escribe tu apellido (hasta 40 letras)." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.reminderTime)) return { ok: false, error: "La hora no es válida." };
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: LOGIN };
  const { data, error } = await supabase
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName, reminder_time: input.reminderTime })
    .eq("id", uid)
    .select("id");
  if (error || !data || data.length === 0) return { ok: false, error: GENERIC };
  revalidatePath("/perfil", "layout");
  return { ok: true };
}

const TZ_ERRORS: Record<string, string> = {
  timezone_recently_changed: "Ya cambiaste tu zona horaria. Puedes volver a cambiarla en 7 días.",
  invalid_timezone: "Esa zona horaria no está disponible.",
};

export async function setTimezone(tz: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) {
    return { ok: false, error: TZ_ERRORS.invalid_timezone };
  }
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: LOGIN };
  const { error } = await supabase.rpc("set_timezone", { p_tz: tz });
  if (error) {
    const key = Object.keys(TZ_ERRORS).find((k) => error.message.includes(k));
    return { ok: false, error: key ? TZ_ERRORS[key] : GENERIC };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Server-side upload with the service role: strips EXIF/comments and validates the JPEG structure. */
export async function uploadAvatar(file: File): Promise<Result> {
  const { uid } = await currentUserId();
  if (!uid) return { ok: false, error: LOGIN };
  if (!(file instanceof File)) return { ok: false, error: "Falta la foto." };
  const clean = processAvatar(await file.arrayBuffer(), file.type);
  if (!clean.ok) return clean;

  const admin = createAdminClient();
  const path = `${uid}.jpg`;
  const { error } = await admin.storage
    .from("avatars")
    .upload(path, clean.bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "60" });
  if (error) return { ok: false, error: "No pudimos subir la foto. Inténtalo de nuevo." };
  const { error: profileError } = await admin.from("profiles").update({ avatar_path: path, avatar_updated_at: new Date().toISOString() }).eq("id", uid);
  if (profileError) return { ok: false, error: GENERIC };
  revalidatePath("/perfil", "layout");
  return { ok: true };
}

/** Privacidad: whether the person appears in Amigos > Sugerencias and in Explorar. */
export async function setDiscoverable(value: boolean): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof value !== "boolean") return { ok: false, error: GENERIC };
  const { data, error } = await auth.supabase
    .from("profiles")
    .update({ discoverable: value })
    .eq("id", auth.userId)
    .select("id");
  if (error || !data || data.length === 0) return { ok: false, error: GENERIC };
  revalidatePath("/amigos", "layout");
  return { ok: true };
}

/** `userId` lets the client clear this account's data kept on the device (Pomodoro timers) before it leaves. */
export async function deleteAccount(confirmUsername: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: LOGIN };
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", uid).maybeSingle();
  const typed = String(confirmUsername ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!profile || typed !== String(profile.username).toLowerCase()) {
    return { ok: false, error: "Escribe tu @usuario tal como aparece para confirmar." };
  }
  try {
    const { data: session } = await supabase.auth.getSession();
    await deleteAccountWith(supabaseDeleteDeps(createAdminClient(), session.session?.access_token), uid, new Date());
  } catch {
    return { ok: false, error: "No pudimos borrar tu cuenta. Inténtalo de nuevo." };
  }
  await supabase.auth.signOut().catch(() => {});
  return { ok: true, userId: uid };
}
