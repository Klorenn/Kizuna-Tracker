import { describe, expect, it } from "vitest";
import { decideAccess } from "@/lib/supabase/access";

const user = { id: "u1" };

describe("decideAccess", () => {
  it("config ok + no user: protected path goes to login", () => {
    expect(decideAccess({ path: "/hoy", configPresent: true, user: null, authError: false })).toEqual({
      kind: "redirect", to: "/login", search: "",
    });
  });
  it("config ok + no user: / goes to bienvenida", () => {
    expect(decideAccess({ path: "/", configPresent: true, user: null, authError: false })).toEqual({
      kind: "redirect", to: "/bienvenida", search: "",
    });
  });
  it("config ok + no user: invite keeps next", () => {
    expect(decideAccess({ path: "/invite/abc", configPresent: true, user: null, authError: false })).toEqual({
      kind: "redirect", to: "/login", search: "?next=%2Finvite%2Fabc",
    });
  });
  it("config ok + user: continues to the profile check", () => {
    expect(decideAccess({ path: "/hoy", configPresent: true, user, authError: false })).toEqual({ kind: "continue" });
  });
  it("missing config on a public path passes", () => {
    expect(decideAccess({ path: "/login", configPresent: false, user: null, authError: false })).toEqual({ kind: "pass" });
    expect(decideAccess({ path: "/api/health", configPresent: false, user: null, authError: false })).toEqual({ kind: "pass" });
  });
  it("missing config on a protected path fails closed", () => {
    expect(decideAccess({ path: "/hoy", configPresent: false, user: null, authError: false })).toEqual({
      kind: "redirect", to: "/login", search: "",
    });
  });
  it("missing config on / goes to bienvenida", () => {
    expect(decideAccess({ path: "/", configPresent: false, user: null, authError: false })).toEqual({
      kind: "redirect", to: "/bienvenida", search: "",
    });
  });
  it("auth error on a protected path is treated as signed out", () => {
    expect(decideAccess({ path: "/hoy", configPresent: true, user: null, authError: true })).toEqual({
      kind: "redirect", to: "/login", search: "",
    });
  });
  it("auth error never lets a user through even if a user is passed", () => {
    expect(decideAccess({ path: "/hoy", configPresent: true, user, authError: true }).kind).toBe("redirect");
  });
  it("auth error on a public path passes", () => {
    expect(decideAccess({ path: "/legal/terminos", configPresent: true, user: null, authError: true })).toEqual({ kind: "pass" });
  });
});
