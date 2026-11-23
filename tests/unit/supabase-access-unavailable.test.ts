import { describe, expect, it } from "vitest";
import { decideAccess } from "@/lib/supabase/access";

const user = { id: "u1" };
const base = { configPresent: true, user: null, authError: true, unavailable: true } as const;

describe("decideAccess: auth unavailable while a session exists", () => {
  it("protected path: retry answer, not a login redirect", () => {
    expect(decideAccess({ ...base, path: "/hoy" })).toEqual({ kind: "unavailable" });
    expect(decideAccess({ ...base, path: "/" })).toEqual({ kind: "unavailable" });
  });
  it("public path passes", () => {
    expect(decideAccess({ ...base, path: "/login" })).toEqual({ kind: "pass" });
    expect(decideAccess({ ...base, path: "/invite/abc" })).toEqual({ kind: "pass" });
  });
  it("never lets a user through", () => {
    expect(decideAccess({ ...base, user, path: "/hoy" }).kind).toBe("unavailable");
  });
  it("without the flag an auth error is still signed out", () => {
    expect(decideAccess({ ...base, unavailable: false, path: "/hoy" }).kind).toBe("redirect");
  });
});
