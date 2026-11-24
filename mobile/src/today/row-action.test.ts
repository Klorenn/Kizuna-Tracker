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
  it("other log types, photo habits and quantity/time with photo stay unsupported", () => {
    expect(rowAction({ ...base, logType: "reading" })).toBe("unsupported");
    expect(rowAction({ ...base, requiresPhoto: true })).toBe("unsupported");
    expect(rowAction({ ...base, logType: "time", requiresPhoto: true })).toBe("unsupported");
    expect(rowAction({ ...base, logType: "quantity", requiresPhoto: true, quantity: { config: {} as never, total: 0, entries: [] } })).toBe("unsupported");
  });
});
