import { accents, darkTokens, lightTokens, radius, space, type AccentName } from "./tokens.generated";

export type ThemeMode = "system" | "light" | "dark";
export type SystemScheme = "light" | "dark" | null | undefined;
export type ThemeColors = Record<keyof typeof lightTokens, string> & { cat: string; cat2: string };

export type Theme = {
  isDark: boolean;
  colors: ThemeColors;
  radius: typeof radius;
  space: typeof space;
  /** A habit's identity color by its stored key (indigo for anything unknown). */
  habitColor(key: string | null | undefined): string;
};

const HABIT_KEYS = ["salvia", "durazno", "lavanda", "arena", "cielo", "rosa", "oliva", "indigo"] as const;

/** Mode and accent to tokens: the accent changes only the accent family; the cat follows the accent, as on the web. */
export function resolveTheme(input: { accent: AccentName; mode: ThemeMode; systemScheme: SystemScheme }): Theme {
  const isDark = input.mode === "dark" || (input.mode === "system" && input.systemScheme === "dark");
  const base = isDark ? darkTokens : lightTokens;
  const accent = (accents[input.accent] ?? accents.indigo)[isDark ? "dark" : "light"];
  const colors: ThemeColors = { ...base, ...accent, cat: accent.accent, cat2: accent.accent2 };
  return {
    isDark,
    colors,
    radius,
    space,
    habitColor(key) {
      const k = (HABIT_KEYS as readonly string[]).includes(key ?? "") ? (key as (typeof HABIT_KEYS)[number]) : "indigo";
      return colors[`habit${k[0].toUpperCase()}${k.slice(1)}` as keyof ThemeColors];
    },
  };
}
