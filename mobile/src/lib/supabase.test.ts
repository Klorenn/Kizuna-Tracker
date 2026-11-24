jest.mock("./auth-storage", () => ({ authStorage: {} }));
jest.mock("./env", () => ({ env: () => ({}) }));

import { createAppSupabase } from "./supabase";
import type { LargeSecureStore } from "./large-secure-store";

describe("createAppSupabase", () => {
  it("passes the encrypted storage and the session options, with URL detection off", () => {
    const storage = { getItem: jest.fn() } as unknown as LargeSecureStore;
    const factory = jest.fn(() => ({ marker: true }));
    const out = createAppSupabase({ supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon" }, storage, factory as never);
    expect(out).toEqual({ marker: true });
    expect(factory).toHaveBeenCalledWith("https://x.supabase.co", "anon", {
      auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  });
});
