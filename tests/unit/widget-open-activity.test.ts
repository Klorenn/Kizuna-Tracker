import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source contract for WidgetOpenActivity (no JVM test runner is wired for the widget library): the tap opens the
 * native app through kizuna:// first and falls back to the https URL, which is what the TWA handles. The on-device
 * behaviour (native app opens; TWA still works) is checked in task 0.16.
 */
const java = readFileSync("android/widget/src/main/java/com/kizunatracker/widget/WidgetOpenActivity.java", "utf8");

describe("WidgetOpenActivity", () => {
  it("builds a kizuna:// intent from the path without its leading slash, restricted to our own package", () => {
    expect(java).toMatch(/Uri\.parse\("kizuna:\/\/" \+ path\.substring\(1\)\)/);
    expect(java).toMatch(/\.setPackage\(getPackageName\(\)\)/);
  });
  it("falls back to the https base URL when no activity handles kizuna:// (the TWA)", () => {
    expect(java).toContain("ActivityNotFoundException");
    expect(java).toMatch(/getString\(R\.string\.kz_widget_base_url\) \+ path/);
    // the native attempt comes first, the web fallback after it
    expect(java.indexOf('"kizuna://"')).toBeLessThan(java.indexOf("kz_widget_base_url"));
  });
  it("still refreshes the widget and normalises a missing or relative path to /", () => {
    expect(java).toContain("ACTION_REFRESH");
    expect(java).toMatch(/path == null \|\| !path\.startsWith\("\/"\)\) path = "\/"/);
  });
});
