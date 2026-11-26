import { describe, expect, it } from "vitest";
import { practiceReport, validatePracticeInput } from "@/domain/personal-challenge";

const week = {
  startsOn: "2026-11-23",
  weeks: 1,
  frequency: { type: "weekly" as const, target: 3 },
  fineAmount: 1000,
};

describe("practiceReport", () => {
  it("does not charge the fine while the week is still open", () => {
    const report = practiceReport(week, ["2026-11-23"], "2026-11-25");
    expect(report.owed).toBe(0);
    expect(report.finished).toBe(false);
    expect(report.current).toMatchObject({ index: 1, total: 1, done: 1, needed: 3, end: "2026-11-29" });
  });

  it("charges one fine per closed week that missed the target", () => {
    const report = practiceReport(week, ["2026-11-23"], "2026-11-30");
    expect(report.owed).toBe(1000);
    expect(report.finished).toBe(true);
    expect(report.current).toBeNull();
  });

  it("charges nothing when the closed week was met", () => {
    const report = practiceReport(week, ["2026-11-23", "2026-11-24", "2026-11-25"], "2026-11-30");
    expect(report.owed).toBe(0);
    expect(report.finished).toBe(true);
  });
});

describe("validatePracticeInput", () => {
  it("accepts a short weekly practice", () => {
    expect(validatePracticeInput({ habitId: "h", target: 3, weeks: 1, fineAmount: 1000 })).toEqual({ ok: true });
  });

  it("keeps the practice shorter than a real challenge", () => {
    expect(validatePracticeInput({ habitId: "h", target: 3, weeks: 5, fineAmount: 1000 }).ok).toBe(false);
  });
});
