import { describe, expect, it } from "vitest";
import { TIME_ERRORS, TIME_FINAL_CODES, TIME_GENERIC, timeCodeOf, timeMessageFor } from "@/lib/time-copy";

describe("time copy", () => {
  it("maps codes", () => {
    expect(timeMessageFor("invalid_minutes")).toBe("El tiempo va de 1 minuto a 24 horas.");
    expect(timeMessageFor("block_expired")).toBe("Un bloque terminó ayer y ya no se puede sumar.");
    expect(timeMessageFor(undefined)).toBe(TIME_GENERIC);
    expect(timeMessageFor("weird")).toBe(TIME_GENERIC);
  });
  it("recognizes a lost session and a malformed block id", () => {
    expect(timeCodeOf("JWT expired")).toBe("not_authenticated");
    expect(timeCodeOf('invalid input syntax for type uuid: "x"')).toBe("invalid_block");
    expect(timeCodeOf("habit_not_found")).toBe("habit_not_found");
    expect(timeCodeOf(undefined)).toBeNull();
  });
  it("final codes never include the session code and all have copy", () => {
    expect(TIME_FINAL_CODES).not.toContain("not_authenticated");
    for (const c of TIME_FINAL_CODES) expect(TIME_ERRORS[c]).toBeTruthy();
  });
});
