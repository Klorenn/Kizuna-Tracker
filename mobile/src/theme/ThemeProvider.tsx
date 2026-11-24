import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { resolveTheme, type Theme, type ThemeMode } from "./theme";
import type { AccentName } from "./tokens.generated";

const ThemeContext = createContext<Theme | null>(null);

/** Accent and mode come from per-device preferences (defaults: indigo, follow the system), as on the web. */
export function ThemeProvider({ accent = "indigo", mode = "system", children }: { accent?: AccentName; mode?: ThemeMode; children: ReactNode }) {
  const systemScheme = useColorScheme();
  const theme = useMemo(() => resolveTheme({ accent, mode, systemScheme }), [accent, mode, systemScheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

const FALLBACK = resolveTheme({ accent: "indigo", mode: "light", systemScheme: null });

/** The current theme; the light indigo theme when rendered outside a provider (tests, error screens). */
export function useTheme(): Theme {
  return useContext(ThemeContext) ?? FALLBACK;
}
