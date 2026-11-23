"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { localDate } from "@/domain/dates";
import { isAvatarPreset } from "@/lib/avatar-presets";
import { createAdminClient } from "@/lib/supabase/admin";
import { skipRateLimit } from "@/lib/rate-limit-mode";
import { clientIp } from "@/lib/request-ip";
import { supabaseServiceKey } from "@/lib/supabase/env.server";
import { createServerClient } from "@/lib/supabase/server";
import { normalizeUsername, validateSignup, type SignupInput } from "@/lib/signup";

const GENERIC_SIGNUP_ERROR =
  "No pudimos crear tu cuenta. Revisa tus datos e inténtalo de nuevo.";
const RATE_LIMITED_ERROR =
  "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
const USERNAME_TAKEN_ERROR = "Ese usuario ya está en uso.";

export async function checkUsername(
  username: string,
): Promise<{ available: boolean; rateLimited?: boolean }> {
  if (typeof username !== "string") return { available: false };
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) return { available: false };
  const ip = clientIp(await headers());
  const admin = createAdminClient();
  if (ip && !skipRateLimit(ip)) {
    const { data: ok, error: limitError } = await admin.rpc("register_login_attempt", {
      p_keys: [`chk:${ip}`],
    });
    if (limitError || ok !== true) return { available: false, rateLimited: true };
  }
  // service role only: a direct /rpc call would skip the chk: throttle above
  const { data, error } = await admin.rpc("username_available", { p_username: normalized });
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
    // an invalid choice is dropped: the database then assigns a random preset
    avatarPreset: isAvatarPreset(input.avatarPreset) ? input.avatarPreset : undefined,
  };
  const checked = validateSignup(clean, todayIn(clean.timezone));
  if (!checked.ok) return { ok: false, error: checked.error };

  const ip = clientIp(await headers());
  if (ip && !skipRateLimit(ip)) {
    const { data: allowed, error: limitError } = await createAdminClient().rpc(
      "register_login_attempt",
      { p_keys: [`signup:${ip}`] },
    );
    if (limitError || allowed !== true) return { ok: false, error: RATE_LIMITED_ERROR };
  }

  const { data: free } = await createAdminClient().rpc("username_available", {
    p_username: clean.username,
  });
  if (free !== true) return { ok: false, error: USERNAME_TAKEN_ERROR };

  const supabase = await createServerClient();
  const metadata = {
    first_name: clean.firstName,
    last_name: clean.lastName,
    birth_date: clean.birthDate,
    username: clean.username,
    timezone: clean.timezone,
    terms_accepted: true,
    ...(clean.avatarPreset !== undefined ? { avatar_preset: clean.avatarPreset } : {}),
  };

  if (supabaseServiceKey()) {
    // Never depend on the dashboard's "Confirm email" setting: create the user already
    // confirmed, then sign in so the session cookies are set on this request.
    const admin = createAdminClient();
    const { error: createError } = await admin.auth.admin.createUser({
      email: clean.email,
      password: clean.password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (createError) {
      // A handle taken in between makes the profile trigger fail the creation.
      const { data: stillFree } = await admin.rpc("username_available", {
        p_username: clean.username,
      });
      return {
        ok: false,
        error: stillFree === true ? GENERIC_SIGNUP_ERROR : USERNAME_TAKEN_ERROR,
      };
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: clean.email,
      password: clean.password,
    });
    // Account exists: no retry, no deletion; the person signs in by hand.
    if (signInError) redirect("/login?notice=cuenta-lista");
    redirect("/listo");
  }

  const { data, error } = await supabase.auth.signUp({
    email: clean.email,
    password: clean.password,
    options: { data: metadata },
  });
  // Any failure (existing email included) gets the same neutral message.
  if (error || !data.session) return { ok: false, error: GENERIC_SIGNUP_ERROR };
  redirect("/listo");
}
