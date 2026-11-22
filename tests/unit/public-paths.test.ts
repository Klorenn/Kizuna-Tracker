import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "@/lib/supabase/public-paths";

describe("isPublicPath", () => {
  it.each(["/login", "/auth/callback", "/legal/terminos", "/invite/abc"])(
    "%s is public",
    (p) => expect(isPublicPath(p)).toBe(true),
  );
  it.each(["/loginfoo", "/hoy", "/", "/authx", "/invites"])(
    "%s is not public",
    (p) => expect(isPublicPath(p)).toBe(false),
  );
});

describe("safeNextPath", () => {
  it("accepts invite paths only", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/hoy")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
