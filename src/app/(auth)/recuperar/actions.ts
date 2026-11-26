"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RESET_INVALID, RESET_SENT, planPasswordReset } from "@/lib/password-reset";
import { skipRateLimit } from "@/lib/rate-limit-mode";
import { clientIp } from "@/lib/request-ip";
import { MIN_PASSWORD_LENGTH } from "@/lib/signup";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export async function requestPasswordReset(
  identifier: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const plan = planPasswordReset(identifier);
  if (plan.kind === "invalid") return { ok: false, error: RESET_INVALID };

  const ip = clientIp(await headers());
  const admin = createAdminClient();
  if (!skipRateLimit(ip)) {
    const { data, error } = await admin.rpc("register_login_attempt", {
      p_keys: [`reset:${plan.id.value}`, ip ? `ip:${ip}` : "ip:none"],
    });
    if (error || data !== true) return { ok: true, message: RESET_SENT };
  }

  const { data } = await admin.rpc("account_for_login", { p_kind: plan.id.kind, p_value: plan.id.value });
  const email = data?.[0]?.email;
  if (email) {
    const supabase = await createServerClient();
    const origin = siteOrigin(await headers());
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/recover` });
  }
  return { ok: true, message: RESET_SENT };
}

export async function setNewPassword(input: {
  password: string;
  confirm: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input || typeof input.password !== "string" || typeof input.confirm !== "string") {
    return { ok: false, error: "Escribe la contraseña dos veces." };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (input.password !== input.confirm) return { ok: false, error: "Las contraseñas no coinciden." };

  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "El enlace venció. Pide otro desde Iniciar sesión." };
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) return { ok: false, error: "No pudimos guardar la contraseña. Pide otro enlace." };
  redirect("/");
}
