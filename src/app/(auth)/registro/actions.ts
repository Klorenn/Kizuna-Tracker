"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { localDate } from "@/domain/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { normalizeUsername, validateSignup, type SignupInput } from "@/lib/signup";

const GENERIC_SIGNUP_ERROR =
  "No pudimos crear tu cuenta. Revisa tus datos e inténtalo de nuevo.";
const RATE_LIMITED_ERROR =
  "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
const USERNAME_TAKEN_ERROR = "Ese usuario ya está en uso.";

export async function checkUsername(
  username: string,
): Promise<{ available: boolean }> {
  if (typeof username !== "string") return { available: false };
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) return { available: false };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("username_available", {
    p_username: normalized,
  });
  return { available: !error && data === true };
}

function isSignupInput(v: unknown): v is SignupInput {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    ["firstName", "lastName", "birthDate", "username", "email", "password", "passwordConfirm", "timezone"].every(
      (k) => typeof o[k] === "string",
    ) && typeof o.acceptTerms === "boolean"
  );
}

function todayIn(timezone: string): string {
  try {
    return localDate(new Date(), timezone);
  } catch {
    return localDate(new Date(), "UTC");
  }
}

export async function signUp(
  input: SignupInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSignupInput(input)) return { ok: false, error: GENERIC_SIGNUP_ERROR };
  const clean: SignupInput = {
    ...input,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username: normalizeUsername(input.username),
    email: input.email.trim().toLowerCase(),
  };
  const checked = validateSignup(clean, todayIn(clean.timezone));
  if (!checked.ok) return { ok: false, error: checked.error };

  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const { data: allowed, error: limitError } = await createAdminClient().rpc(
    "register_login_attempt",
    { p_keys: [`signup:${ip}`] },
  );
  if (limitError || allowed !== true) return { ok: false, error: RATE_LIMITED_ERROR };

  const supabase = await createServerClient();
  const { data: free } = await supabase.rpc("username_available", {
    p_username: clean.username,
  });
  if (free !== true) return { ok: false, error: USERNAME_TAKEN_ERROR };

  const { data, error } = await supabase.auth.signUp({
    email: clean.email,
    password: clean.password,
    options: {
      data: {
        first_name: clean.firstName,
        last_name: clean.lastName,
        birth_date: clean.birthDate,
        username: clean.username,
        timezone: clean.timezone,
        terms_accepted: true,
      },
    },
  });
  // Any failure (existing email included) gets the same neutral message.
  if (error || !data.session) return { ok: false, error: GENERIC_SIGNUP_ERROR };
  redirect("/listo");
}
