import { describe, expect, it } from "vitest";
import { RESET_INVALID, planPasswordReset } from "@/lib/password-reset";

describe("planPasswordReset", () => {
  it("looks up a mail or a username without saying which reply the user will see", () => {
    expect(planPasswordReset("Ada@Kizuna.dev")).toEqual({
      kind: "lookup",
      id: { kind: "email", value: "ada@kizuna.dev" },
    });
    expect(planPasswordReset("@kizuna_e2e")).toEqual({
      kind: "lookup",
      id: { kind: "username", value: "kizuna_e2e" },
    });
  });

  it("rejects a shape that is neither", () => {
    expect(planPasswordReset("a")).toEqual({ kind: "invalid" });
    expect(RESET_INVALID.length).toBeGreaterThan(0);
  });
});
