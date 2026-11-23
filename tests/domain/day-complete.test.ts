import { describe, expect, it } from "vitest";
import { shouldCelebrateDay } from "@/domain/day-complete";

describe("shouldCelebrateDay", () => {
  it("is true when the last pending habit gets completed", () => {
    expect(shouldCelebrateDay({ done: 2, total: 3 }, { done: 3, total: 3 })).toBe(true);
  });
  it("is true for a single-habit day", () => {
    expect(shouldCelebrateDay({ done: 0, total: 1 }, { done: 1, total: 1 })).toBe(true);
  });
  it("is false on first render (no previous state), even at 100%", () => {
    expect(shouldCelebrateDay(null, { done: 3, total: 3 })).toBe(false);
  });
  it("is false while habits remain", () => {
    expect(shouldCelebrateDay({ done: 0, total: 3 }, { done: 1, total: 3 })).toBe(false);
  });
  it("is false when it was already complete", () => {
    expect(shouldCelebrateDay({ done: 3, total: 3 }, { done: 3, total: 3 })).toBe(false);
  });
  it("is false when undoing", () => {
    expect(shouldCelebrateDay({ done: 3, total: 3 }, { done: 2, total: 3 })).toBe(false);
  });
  it("is false when the habit count changed or the day is empty", () => {
    expect(shouldCelebrateDay({ done: 2, total: 2 }, { done: 3, total: 3 })).toBe(false);
    expect(shouldCelebrateDay({ done: 0, total: 0 }, { done: 0, total: 0 })).toBe(false);
  });
  it("shows only the gym sheet when a gym check-in completes the day", () => {
    expect(shouldCelebrateDay({ done: 2, total: 3 }, { done: 3, total: 3 }, { gymSheet: true })).toBe(false);
  });
});
