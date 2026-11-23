"use server";

import { cookies } from "next/headers";
import {
  COLORS,
  COLOR_COOKIE,
  THEMES,
  THEME_COOKIE,
  colorCookieOptions,
  themeCookieOptions,
  type Color,
  type Theme,
} from "@/lib/theme";

/** Perfil > Tema. Works with or without a session: the theme is a device preference. */
export async function setTheme(theme: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof theme !== "string" || !(THEMES as readonly string[]).includes(theme)) {
    return { ok: false, error: "Ese tema no está disponible." };
  }
  (await cookies()).set(THEME_COOKIE, theme as Theme, themeCookieOptions(process.env.NODE_ENV === "production"));
  return { ok: true };
}

/** Ajustes > Color. Same rules as setTheme: a device preference, validated here, no session needed. */
export async function setColor(color: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof color !== "string" || !(COLORS as readonly string[]).includes(color)) {
    return { ok: false, error: "Ese color no está disponible." };
  }
  (await cookies()).set(COLOR_COOKIE, color as Color, colorCookieOptions(process.env.NODE_ENV === "production"));
  return { ok: true };
}
