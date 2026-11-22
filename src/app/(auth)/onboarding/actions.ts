"use server";

import { createServerClient } from "@/lib/supabase/server";
import {
  validateOnboarding,
  type OnboardingInput,
  type OnboardingResult,
} from "@/lib/onboarding";

export async function completeOnboarding(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  if (
    !input ||
    typeof input.username !== "string" ||
    typeof input.displayName !== "string" ||
    typeof input.timezone !== "string" ||
    input.isAdult !== true ||
    input.acceptTerms !== true
  ) {
    return { ok: false, error: "Datos inválidos" };
  }
  const checked = validateOnboarding(input);
  if (!checked.ok) return checked;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Volvé a entrar." };

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    username: input.username,
    display_name: input.displayName.trim(),
    timezone: input.timezone,
    is_adult: input.isAdult,
  });
  if (error) {
    if (error.code === "23505") {
      const detail = `${error.message} ${error.details ?? ""}`;
      return {
        ok: false,
        error: detail.includes("profiles_pkey")
          ? "Tu cuenta ya tiene un perfil."
          : "Ese usuario ya existe",
      };
    }
    return { ok: false, error: "No pudimos crear tu perfil. Probá de nuevo." };
  }
  return { ok: true };
}
