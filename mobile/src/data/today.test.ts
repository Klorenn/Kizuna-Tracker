import fixture from "../../../tests/fixtures/today-fixture.json";
import { fetchGroupChips, selectToday, todayRawOf, type TodayRaw } from "./today";

const raw = fixture.raw as unknown as TodayRaw;
const now = new Date(fixture.nowIso);

describe("selectToday", () => {
  const view = selectToday(raw, now);

  it("equals the web's Hoy for the shared fixture (rows, streaks, week counts, items, label)", () => {
    expect(view.label).toBe(fixture.expected.label);
    expect(view.doneCount).toBe(fixture.expected.doneCount);
    expect(view.total).toBe(fixture.expected.total);
    expect(view.bestDailyStreak).toBe(fixture.expected.bestDailyStreak);
    expect(
      view.rows.map((r) => ({
        id: r.id,
        name: r.name,
        done: r.done,
        streak: r.streak,
        weekCount: r.weekCount,
        items: r.items.map((i) => ({ id: i.id, label: i.label, checked: i.checked, time: i.time })),
      })),
    ).toEqual(fixture.expected.rows);
  });
  it("carries the group chips by habit id, empty when the raw has none", () => {
    expect(view.groupChips).toEqual(Object.fromEntries(raw.groupChips ?? []));
    const withChip = selectToday({ ...raw, groupChips: [["h1", { name: "Corremos", color: "cielo" }]] }, now);
    expect(withChip.groupChips).toEqual({ h1: { name: "Corremos", color: "cielo" } });
  });
  it("progress is done over total, 0 for an empty Hoy", () => {
    expect(view.progress).toBeCloseTo(1 / 3, 5);
    expect(selectToday({ ...raw, habits: [], items: [], checkins: [], itemChecks: [] }, now).progress).toBe(0);
  });
  it("survives a JSON round trip (what the persisted query cache does)", () => {
    const revived = JSON.parse(JSON.stringify(raw)) as TodayRaw;
    expect(selectToday(revived, now)).toEqual(view);
  });
});

describe("todayRawOf", () => {
  it("turns the group chips Map into entries so it persists as JSON, and drops the ok flag", () => {
    const data = { ...(fixture.raw as object), ok: true, groupChips: new Map([["h1", { name: "Corremos", color: "teal" }]]) } as never;
    const r = todayRawOf(data);
    expect(r.groupChips).toEqual([["h1", { name: "Corremos", color: "teal" }]]);
    expect(JSON.parse(JSON.stringify(r)).groupChips).toEqual(r.groupChips);
    expect(r.today).toBe("2026-11-25");
  });
});

describe("fetchGroupChips", () => {
  const clientWith = (answer: unknown) => ({ rpc: jest.fn().mockResolvedValue(answer) }) as never;
  it("maps my_groups rows to habit chips", async () => {
    const c = clientWith({ data: [{ id: "g", name: "Corremos", color: "cielo", archived: false, my_habit_id: "h1" }], error: null });
    expect([...(await fetchGroupChips(c)).entries()]).toEqual([["h1", { name: "Corremos", color: "cielo" }]]);
    expect((c as unknown as { rpc: jest.Mock }).rpc).toHaveBeenCalledWith("my_groups");
  });
  it("is empty, never an error, when the call fails (chips are decorative)", async () => {
    expect((await fetchGroupChips(clientWith({ data: null, error: { message: "x" } }))).size).toBe(0);
    const throwing = { rpc: jest.fn().mockRejectedValue(new Error("offline")) } as never;
    expect((await fetchGroupChips(throwing)).size).toBe(0);
  });
});
