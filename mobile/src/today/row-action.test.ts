import { rowAction } from "./row-action";

const base: Parameters<typeof rowAction>[0] = { logType: "none", items: [], requiresPhoto: false, quantity: null, done: false };

describe("rowAction", () => {
  it("a plain habit is boolean", () => expect(rowAction({ ...base })).toBe("boolean"));
  it("a habit with steps is items", () =>
    expect(rowAction({ ...base, items: [{ id: "i", label: "a", requiresPhoto: false, checked: false, time: null }] })).toBe("items"));
  it("steps that need a photo stay steps: the row is native and the step opens the camera", () =>
    expect(rowAction({ ...base, items: [{ id: "i", label: "a", requiresPhoto: true, checked: false, time: null }] })).toBe("items"));
  it("steps on a habit that itself needs a photo are still unsupported (the server refuses a step photo there)", () =>
    expect(rowAction({ ...base, requiresPhoto: true, items: [{ id: "i", label: "a", requiresPhoto: false, checked: false, time: null }] })).toBe("unsupported"));
  it("quantity and time habits are native", () => {
    expect(rowAction({ ...base, logType: "quantity", quantity: { config: {} as never, total: 0, entries: [] } })).toBe("quantity");
    expect(rowAction({ ...base, logType: "time" })).toBe("time");
  });
  it("a habit that needs a photo opens the camera until it is done, whatever it logs", () => {
    expect(rowAction({ ...base, requiresPhoto: true })).toBe("photo");
    for (const t of ["time", "reading", "workout", "cardio", "watch"] as const) expect(rowAction({ ...base, logType: t, requiresPhoto: true })).toBe("photo");
  });
  it("once the photo made the check-in, the habit goes back to its own action (undo, or the log screen)", () => {
    expect(rowAction({ ...base, requiresPhoto: true, done: true })).toBe("boolean");
    expect(rowAction({ ...base, logType: "reading", requiresPhoto: true, done: true })).toBe("reading");
    expect(rowAction({ ...base, logType: "time", requiresPhoto: true, done: true })).toBe("time");
  });
  it("a quantity habit with a photo requirement stays unsupported (the route refuses a quantity photo)", () => {
    expect(rowAction({ ...base, logType: "quantity", requiresPhoto: true, quantity: { config: {} as never, total: 0, entries: [] } })).toBe("unsupported");
  });
  it("reading, workout, cardio and watch habits are native", () => {
    for (const t of ["reading", "workout", "cardio", "watch"] as const) expect(rowAction({ ...base, logType: t })).toBe(t);
  });
});
