/** The app's public config, read once. EXPO_PUBLIC_* are inlined at build time, so each is referenced literally. */
export type AppEnv = { supabaseUrl: string; supabaseAnonKey: string; apiUrl: string };

const NAMES = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY", "EXPO_PUBLIC_API_URL"] as const;

export function readEnv(raw: Partial<Record<(typeof NAMES)[number], string | undefined>>): AppEnv {
  const v = (name: (typeof NAMES)[number]) => raw[name]?.trim() ?? "";
  const missing = NAMES.filter((n) => v(n) === "");
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
  return {
    supabaseUrl: v("EXPO_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: v("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
    apiUrl: v("EXPO_PUBLIC_API_URL").replace(/\/+$/, ""),
  };
}

let cached: AppEnv | null = null;

export function env(): AppEnv {
  return (cached ??= readEnv({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  }));
}
