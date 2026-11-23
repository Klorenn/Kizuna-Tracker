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

import { pickCelebration, type HoyState } from "@/domain/day-complete";

const row = (id: string, preset: string | null, hasItems: boolean, done: boolean) => ({ id, preset, hasItems, done });
const state = (rows: ReturnType<typeof row>[]): HoyState => ({
  done: rows.filter((r) => r.done).length,
  total: rows.length,
  rows,
});

describe("pickCelebration", () => {
  const read0 = row("r", "read", false, false);
  const read1 = row("r", "read", false, true);
  const eat0 = row("e", "eat_well", true, false);
  const eat1 = row("e", "eat_well", true, true);
  const other0 = row("o", "water", true, false);
  const other1 = row("o", "water", true, true);

  it("never celebrates on first render", () => {
    expect(pickCelebration(null, state([read1, eat1]))).toBeNull();
  });
  it("day complete when the last habit is done", () => {
    expect(pickCelebration(state([read0]), state([read1]))).toBe("day");
  });
  it("meals complete when Comer bien finishes but the day stays open", () => {
    expect(pickCelebration(state([read0, eat0]), state([read0, eat1]))).toBe("meals");
  });
  it("day beats meals when finishing the meals also completes the day", () => {
    expect(pickCelebration(state([read1, eat0]), state([read1, eat1]))).toBe("day");
  });
  it("other item habits do not qualify for meals", () => {
    expect(pickCelebration(state([read0, other0]), state([read0, other1]))).toBeNull();
  });
  it("gym sheet wins over everything", () => {
    expect(pickCelebration(state([read1, eat0]), state([read1, eat1]), { gymSheet: true })).toBeNull();
  });
  it("nothing when Comer bien was already done", () => {
    expect(pickCelebration(state([read0, eat1]), state([read1, eat1]))).toBe("day");
    expect(pickCelebration(state([read0, eat1]), state([read0, eat1]))).toBeNull();
  });
});

import { completedMealsHabit } from '@/domain/day-complete'

describe('completedMealsHabit', () => {
  it('names the eat_well habit that just got all its meals', () => {
    const row = (done: boolean) => ({ id: 'm1', preset: 'eat_well', hasItems: true, done })
    expect(completedMealsHabit({ done: 0, total: 2, rows: [row(false)] }, { done: 1, total: 2, rows: [row(true)] })).toBe('m1')
    expect(completedMealsHabit({ done: 1, total: 2, rows: [row(true)] }, { done: 1, total: 2, rows: [row(true)] })).toBeNull()
  })
})
