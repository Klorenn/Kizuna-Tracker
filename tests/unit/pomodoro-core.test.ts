import { describe, expect, it } from "vitest";
import { initialPomodoro, pomodoroReducer } from "@/domain/pomodoro";
import {
  ACTION_REV_BUMP,
  DEFAULT_POMODORO_PREFS,
  loadPomodoro,
  loadPrefs,
  loadSession,
  pomodoroBoxReducer,
  savePomodoro,
  savePomodoroIfNewer,
  savePrefs,
  saveSession,
  stateKey,
  type KeyValueStorage,
} from "@/lib/pomodoro-core";
import * as webStore from "@/lib/pomodoro-store";

// A storage that is not the browser's: only get/set/remove, like the native MMKV adapter.
function memStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);
const MIN = 60_000;
const cfg = { focusMin: 25, breakMin: 5, cycles: 4 };
const started = () => pomodoroReducer(initialPomodoro("h1", cfg), { type: "start", at: T0, blockId: "b1" });

describe("pomodoro-core over any key-value storage", () => {
  it("saves and loads a running state", () => {
    const st = memStorage();
    const s = started();
    expect(savePomodoro(s, st)).toBe(true);
    expect(loadPomodoro("h1", st, T0 + MIN)).toEqual(s);
  });
  it("discards a corrupted or foreign state", () => {
    const st = memStorage();
    st.setItem(stateKey("h1"), "{nope");
    expect(loadPomodoro("h1", st)).toBeNull();
    expect(st.data.has(stateKey("h1"))).toBe(false);
  });
  it("does not clobber a state with a higher rev", () => {
    const st = memStorage();
    const s = started();
    savePomodoro({ ...s, rev: s.rev + 5 }, st);
    const r = savePomodoroIfNewer(s, st);
    expect(r.status).toBe("stale");
    expect(savePomodoroIfNewer({ ...s, rev: s.rev + 9 }, st).status).toBe("saved");
  });
  it("a write the device refuses is reported, not thrown", () => {
    const st = memStorage();
    st.setItem = () => {
      throw new Error("full");
    };
    expect(savePomodoro(started(), st)).toBe(false);
  });
  it("prefs: defaults, round trip, garbage falls back", () => {
    const st = memStorage();
    expect(loadPrefs("h1", st)).toEqual(DEFAULT_POMODORO_PREFS);
    const p = { ...DEFAULT_POMODORO_PREFS, mode: "stopwatch" as const, topic: "mate", muted: true };
    savePrefs("h1", p, st);
    expect(loadPrefs("h1", st)).toEqual(p);
    st.setItem("kizuna:pomodoro:config:h1", "xx");
    expect(loadPrefs("h1", st)).toEqual(DEFAULT_POMODORO_PREFS);
  });
  it("session tally round trip", () => {
    const st = memStorage();
    const s = { blocks: 2, minutes: 50, last: 25, lastId: "b2", lastStatus: "pending" as const };
    expect(saveSession("h1", s, st)).toBe(true);
    expect(loadSession("h1", st)).toEqual(s);
  });
  it("the box reducer bumps user actions above ticks and tallies a closed block", () => {
    const box = { s: started(), session: { blocks: 0, minutes: 0, last: 0, lastId: null, lastStatus: null } };
    const ticked = pomodoroBoxReducer(box, { type: "tick", at: T0 + 25 * MIN });
    expect(ticked.s.pending).toEqual([{ blockId: "b1", minutes: 25, endedAt: T0 + 25 * MIN }]);
    expect(ticked.session).toMatchObject({ blocks: 1, minutes: 25, lastId: "b1", lastStatus: "pending" });
    const paused = pomodoroBoxReducer(box, { type: "pause", at: T0 + MIN });
    expect(paused.s.rev).toBeGreaterThanOrEqual(box.s.rev + ACTION_REV_BUMP);
  });
  it("the web store still re-exports the same functions", () => {
    expect(webStore.loadPomodoro).toBe(loadPomodoro);
    expect(webStore.pomodoroBoxReducer).toBe(pomodoroBoxReducer);
    expect(webStore.stateKey).toBe(stateKey);
  });
});
