import { localDate } from "@/domain/dates";

describe("shared src/ code through the @/ alias", () => {
  it("runs a whitelisted domain function (date-fns and @date-fns/tz resolve from mobile/node_modules)", () => {
    const at = new Date("2026-11-25T02:30:00Z");
    expect(localDate(at, "America/Santiago")).toBe("2026-11-24");
    expect(localDate(at, "Asia/Tokyo")).toBe("2026-11-25");
  });
});
