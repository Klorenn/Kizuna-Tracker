"use server";

import { cookies } from "next/headers";
import { THEMES, THEME_COOKIE, themeCookieOptions, type Theme } from "@/lib/theme";

/** Perfil > Tema. Works with or without a session: the theme is a device preference. */
export async function setTheme(theme: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof theme !== "string" || !(THEMES as readonly string[]).includes(theme)) {
    return { ok: false, error: "Ese tema no está disponible." };
  }
  (await cookies()).set(THEME_COOKIE, theme as Theme, themeCookieOptions(process.env.NODE_ENV === "production"));
  return { ok: true };
}
