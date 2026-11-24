import { readEnv } from "./env";

describe("readEnv", () => {
  const good = { EXPO_PUBLIC_SUPABASE_URL: " https://x.supabase.co ", EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon", EXPO_PUBLIC_API_URL: "https://kizuna-tracker.vercel.app/" };
  it("returns trimmed values and an API origin without a trailing slash", () => {
    expect(readEnv(good)).toEqual({ supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon", apiUrl: "https://kizuna-tracker.vercel.app" });
  });
  it("names every missing variable", () => {
    expect(() => readEnv({ EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toThrow(
      "Missing env: EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL",
    );
  });
  it("treats blank values as missing", () => {
    expect(() => readEnv({ ...good, EXPO_PUBLIC_SUPABASE_ANON_KEY: "   " })).toThrow("Missing env: EXPO_PUBLIC_SUPABASE_ANON_KEY");
  });
});
