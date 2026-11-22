"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { LOGIN_GENERIC_ERROR, loginWith } from "@/lib/login";

export async function signIn(input: {
  identifier: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    !input ||
    typeof input.identifier !== "string" ||
    typeof input.password !== "string" ||
    input.identifier.length > 320
  ) {
    return { ok: false, error: LOGIN_GENERIC_ERROR };
  }
  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const admin = createAdminClient();
  const supabase = await createServerClient();

  return loginWith(
    {
      async registerAttempt(keys) {
        const { data, error } = await admin.rpc("register_login_attempt", {
          p_keys: keys,
        });
        // Fail closed: if the limiter is down nobody gets to try.
        return !error && data === true;
      },
      async emailForUsername(username) {
        const { data, error } = await admin.rpc("email_for_username", {
          p_username: username,
        });
        return error || typeof data !== "string" ? null : data;
      },
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { ok: !error };
      },
    },
    input,
    ip,
  );
}

export async function signOut(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/bienvenida");
}
