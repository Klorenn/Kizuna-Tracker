import { describe, expect, it } from "vitest";
import { checkinDateAllowed } from "@/domain/checkin-window";

const TZ = "America/Santiago";

describe("checkinDateAllowed", () => {
  it("allows yesterday before noon and closes it at noon", () => {
    // November in Chile is UTC−3. 14:59Z is 11:59; 15:00Z is 12:00.
    expect(checkinDateAllowed(new Date("2026-11-25T14:59:00.000Z"), TZ, "2026-11-24")).toBe(true);
    expect(checkinDateAllowed(new Date("2026-11-25T15:00:00.000Z"), TZ, "2026-11-24")).toBe(false);
  });

  it("always allows today and never the day before yesterday", () => {
    const noon = new Date("2026-11-25T15:30:00.000Z");
    expect(checkinDateAllowed(noon, TZ, "2026-11-25")).toBe(true);
    expect(checkinDateAllowed(noon, TZ, "2026-11-23")).toBe(false);
  });
});
