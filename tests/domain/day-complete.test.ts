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

import { celebratedHabit, isRestHabit, isStudyHabit } from '@/domain/day-complete'

describe('pickCelebration with reading, rest and study', () => {
  const read0 = { id: 'r', preset: 'read', hasItems: false, done: false }
  const read1 = { ...read0, done: true }
  const eat0 = { id: 'e', preset: 'eat_well', hasItems: true, done: false }
  const eat1 = { ...eat0, done: true }
  const other0 = { id: 'o', preset: 'water', hasItems: true, done: false }
  const sleep0 = { id: 's', preset: 'sleep', hasItems: false, done: false }
  const sleep1 = { ...sleep0, done: true }
  const study0 = { id: 't', preset: 'study', hasItems: false, done: false }
  const study1 = { ...study0, done: true }
  const laptop0 = { id: 'l', preset: null, hasItems: false, done: false, icon: 'laptop' }
  const laptop1 = { ...laptop0, done: true }
  type R = { id: string; preset: string | null; hasItems: boolean; done: boolean; icon?: string }
  const st = (rows: R[]): HoyState => ({ done: rows.filter((r) => r.done).length, total: rows.length, rows })
  const finished = { pages: 26, finishedTitle: 'Dune' }
  const plain = { pages: 26, finishedTitle: null }

  it('keeps the brief priority: gym > book > day > meals > reading', () => {
    expect(pickCelebration(st([read0]), st([read1]), { gymSheet: true, reading: finished })).toBeNull()
    expect(pickCelebration(st([read0]), st([read1]), { reading: finished })).toBe('book')
    expect(pickCelebration(st([read0]), st([read1]), { reading: plain })).toBe('day')
    expect(pickCelebration(st([read0, eat0]), st([read0, eat1]), { reading: plain })).toBe('meals')
    expect(pickCelebration(st([read0, other0]), st([read1, other0]), { reading: plain })).toBe('reading')
    expect(pickCelebration(st([read0, other0]), st([read1, other0]), { reading: null })).toBeNull()
  })
  it('rest when Dormir 8 h gets done and the day stays open', () => {
    expect(pickCelebration(st([sleep0, other0]), st([sleep1, other0]))).toBe('rest')
    expect(pickCelebration(st([sleep0]), st([sleep1]))).toBe('day')
    expect(pickCelebration(st([sleep0, eat0, other0]), st([sleep1, eat1, other0]))).toBe('meals')
    expect(pickCelebration(st([sleep1, other0]), st([sleep1, other0]))).toBeNull()
    expect(pickCelebration(st([sleep0, other0]), st([sleep1, other0]), { gymSheet: true })).toBeNull()
  })
  it('study for Estudiar or a laptop/desk icon; rest beats study, study beats reading', () => {
    expect(pickCelebration(st([study0, other0]), st([study1, other0]))).toBe('study')
    expect(pickCelebration(st([laptop0, other0]), st([laptop1, other0]))).toBe('study')
    expect(pickCelebration(st([sleep0, study0, other0]), st([sleep1, study1, other0]))).toBe('rest')
    expect(pickCelebration(st([study0, read0, other0]), st([study1, read1, other0]), { reading: plain })).toBe('study')
    expect(pickCelebration(st([study0, read0, other0]), st([study1, read1, other0]), { reading: finished })).toBe('book')
  })
  it('names the habit that triggered rest or study (once-per-day scope)', () => {
    expect(celebratedHabit('rest', st([sleep0, other0]), st([sleep1, other0]))).toBe('s')
    expect(celebratedHabit('study', st([laptop0, other0]), st([laptop1, other0]))).toBe('l')
    expect(celebratedHabit('study', st([laptop1, other0]), st([laptop1, other0]))).toBeNull()
  })
})

describe('rest and study habits', () => {
  it('rest is the Dormir 8 h preset', () => {
    expect(isRestHabit({ preset: 'sleep' })).toBe(true)
    expect(isRestHabit({ preset: null, icon: 'moon' })).toBe(false)
  })
  it('study is the Estudiar preset or a laptop/desk icon', () => {
    expect(isStudyHabit({ preset: 'study' })).toBe(true)
    expect(isStudyHabit({ preset: null, icon: 'laptop' })).toBe(true)
    expect(isStudyHabit({ preset: null, icon: 'desk' })).toBe(true)
    expect(isStudyHabit({ preset: 'read', icon: 'book' })).toBe(false)
  })
})

import { celebrationCandidates } from '@/domain/day-complete'

describe('celebrationCandidates', () => {
  const r = (id: string, preset: string | null, done: boolean) => ({ id, preset, hasItems: false, done })
  const s = (rows: ReturnType<typeof r>[]): HoyState => ({ done: rows.filter((x) => x.done).length, total: rows.length, rows })

  it('lists every applicable celebration in priority order (the first is pickCelebration)', () => {
    const before = s([r('a', 'sleep', false), r('b', 'read', false)])
    const after = s([r('a', 'sleep', true), r('b', 'read', true)])
    const reading = { pages: 12, finishedTitle: 'Dune' }
    expect(celebrationCandidates(before, after, { reading })).toEqual(['book', 'day', 'rest', 'reading'])
    expect(pickCelebration(before, after, { reading })).toBe('book')
  })
  it('is empty on first render or with the gym sheet', () => {
    const after = s([r('a', null, true)])
    expect(celebrationCandidates(null, after)).toEqual([])
    expect(celebrationCandidates(s([r('a', null, false)]), after, { gymSheet: true })).toEqual([])
  })
})
