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

import { buildAuthRedirect } from "@/lib/supabase/public-paths";

describe("buildAuthRedirect", () => {
  const origin = "http://localhost:3000";
  it("omits next when absent or root", () => {
    expect(buildAuthRedirect(origin, null)).toBe(`${origin}/auth/callback`);
    expect(buildAuthRedirect(origin, "/")).toBe(`${origin}/auth/callback`);
  });
  it("encodes invite next", () => {
    expect(buildAuthRedirect(origin, "/invite/abc")).toBe(
      `${origin}/auth/callback?next=%2Finvite%2Fabc`,
    );
  });
  it("drops unsafe next", () => {
    expect(buildAuthRedirect(origin, "//evil.com")).toBe(`${origin}/auth/callback`);
  });
});
