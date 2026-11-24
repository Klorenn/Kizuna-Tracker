import { rowAction } from "./row-action";

const base: Parameters<typeof rowAction>[0] = { logType: "none", items: [], requiresPhoto: false, quantity: null };

describe("rowAction", () => {
  it("a plain habit is boolean", () => expect(rowAction({ ...base })).toBe("boolean"));
  it("a habit with steps is items", () =>
    expect(rowAction({ ...base, items: [{ id: "i", label: "a", requiresPhoto: false, checked: false, time: null }] })).toBe("items"));
  it("steps that need a photo are unsupported until photos land", () =>
    expect(rowAction({ ...base, items: [{ id: "i", label: "a", requiresPhoto: true, checked: false, time: null }] })).toBe("unsupported"));
  it("quantity and time habits are native", () => {
    expect(rowAction({ ...base, logType: "quantity", quantity: { config: {} as never, total: 0, entries: [] } })).toBe("quantity");
    expect(rowAction({ ...base, logType: "time" })).toBe("time");
  });
  it("photo habits and quantity/time with photo stay unsupported (M3 photo adds them separately)", () => {
    expect(rowAction({ ...base, requiresPhoto: true })).toBe("unsupported");
    expect(rowAction({ ...base, logType: "time", requiresPhoto: true })).toBe("unsupported");
    expect(rowAction({ ...base, logType: "quantity", requiresPhoto: true, quantity: { config: {} as never, total: 0, entries: [] } })).toBe("unsupported");
  });
  it("reading, workout, cardio and watch habits are native", () => {
    for (const t of ["reading", "workout", "cardio", "watch"] as const) expect(rowAction({ ...base, logType: t })).toBe(t);
  });
  it("a reading habit that needs a photo or has steps is not the plain log screen", () => {
    expect(rowAction({ ...base, logType: "reading", requiresPhoto: true })).toBe("unsupported");
  });
});
