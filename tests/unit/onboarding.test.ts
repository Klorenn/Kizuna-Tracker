import { describe, expect, it } from "vitest";
import { validateOnboarding } from "@/lib/onboarding";

const valid = {
  username: "pau_k",
  displayName: "Pau",
  timezone: "America/Santiago",
  isAdult: true,
  acceptTerms: true,
};

describe("validateOnboarding", () => {
  it("accepts valid input", () => {
    expect(validateOnboarding(valid)).toEqual({ ok: true });
  });
  it("rejects minors", () => {
    expect(validateOnboarding({ ...valid, isAdult: false })).toEqual({
      ok: false,
      error: "Tenés que ser mayor de 18",
    });
  });
  it("requires accepting terms", () => {
    expect(validateOnboarding({ ...valid, acceptTerms: false }).ok).toBe(false);
  });
  it.each(["ab", "Pau!", "a".repeat(21), "Pau"])("rejects username %s", (u) => {
    expect(validateOnboarding({ ...valid, username: u }).ok).toBe(false);
  });
  it("rejects empty display name", () => {
    expect(validateOnboarding({ ...valid, displayName: "  " }).ok).toBe(false);
  });
  it("rejects unknown timezone", () => {
    expect(validateOnboarding({ ...valid, timezone: "Mars/Base" }).ok).toBe(false);
  });
});
