"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { LOGIN_GENERIC_ERROR, loginWith } from "@/lib/login";
import { loginDeps } from "@/lib/login-deps";
import { clientIp } from "@/lib/request-ip";

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
  const ip = clientIp(await headers());
  const admin = createAdminClient();
  const supabase = await createServerClient();

  return loginWith(
    loginDeps(
      admin,
      async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { ok: !error };
      },
      ip,
    ),
    input,
    ip,
  );
}

export async function signOut(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/bienvenida");
}
