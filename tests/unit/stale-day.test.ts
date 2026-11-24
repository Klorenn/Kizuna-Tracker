import { describe, expect, it } from "vitest";
import { isStaleTap } from "@/lib/stale-day";

const ZONE = "America/Santiago";
// 2026-03-10 23:50 Santiago (UTC-3 in March) = 2026-03-11 02:50Z
const TAP_DAY = "2026-03-10";

describe("isStaleTap", () => {
  it("is not stale on the same local day", () => {
    expect(isStaleTap({ day: TAP_DAY, zone: ZONE }, Date.UTC(2026, 2, 11, 2, 50))).toBe(false);
  });
  it("is stale once the zone's date moved on", () => {
    expect(isStaleTap({ day: TAP_DAY, zone: ZONE }, Date.UTC(2026, 2, 11, 3, 10))).toBe(true);
  });
  it("unknown day or zone is not stale", () => {
    expect(isStaleTap({}, Date.now())).toBe(false);
    expect(isStaleTap({ day: TAP_DAY }, Date.now())).toBe(false);
    expect(isStaleTap({ zone: ZONE }, Date.now())).toBe(false);
  });
  it("an invalid zone is not stale", () => {
    expect(isStaleTap({ day: TAP_DAY, zone: "Not/AZone" }, Date.now())).toBe(false);
  });
});
