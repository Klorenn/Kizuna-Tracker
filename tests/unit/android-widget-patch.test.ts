import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { patchAppGradle, patchSettings } from "../../scripts/android-widget-patch.mjs";

const SETTINGS = "include ':app'\n";
const APP = `dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    
        implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.7.4'
    
}
`;
const SCRIPT = join(process.cwd(), "scripts/android-widget-patch.mjs");

describe("patchSettings", () => {
  it("appends include ':widget' once", () => {
    const out = patchSettings(SETTINGS);
    expect(out).toBe("include ':app'\ninclude ':widget'\n");
  });
  it("is idempotent", () => {
    const once = patchSettings(SETTINGS);
    expect(patchSettings(once)).toBe(once);
  });
  it("adds a missing trailing newline before appending", () => {
    expect(patchSettings("include ':app'")).toBe("include ':app'\ninclude ':widget'\n");
  });
});

describe("patchAppGradle", () => {
  it("inserts the dependency right after the androidbrowserhelper anchor", () => {
    const out = patchAppGradle(APP);
    const lines = out.split("\n");
    const i = lines.findIndex((l: string) => l.includes("androidbrowserhelper"));
    expect(lines[i + 1]).toBe("    implementation project(':widget')");
    expect(out.match(/project\(':widget'\)/g)).toHaveLength(1);
  });
  it("is idempotent", () => {
    const once = patchAppGradle(APP);
    expect(patchAppGradle(once)).toBe(once);
  });
  it("throws a clear error when the anchor is missing", () => {
    expect(() => patchAppGradle("dependencies {\n}\n")).toThrow(/androidbrowserhelper/);
  });
});

describe("CLI", () => {
  function setup(app = APP) {
    const dir = mkdtempSync(join(tmpdir(), "kzw-"));
    writeFileSync(join(dir, "settings.gradle"), SETTINGS);
    writeFileSync(join(dir, "build.gradle"), app);
    return dir;
  }
  it("patches both files and the second run changes nothing", () => {
    const dir = setup();
    const run = () => execFileSync("node", [SCRIPT, join(dir, "settings.gradle"), join(dir, "build.gradle")]);
    run();
    const s1 = readFileSync(join(dir, "settings.gradle"), "utf8");
    const a1 = readFileSync(join(dir, "build.gradle"), "utf8");
    expect(s1).toContain("include ':widget'");
    expect(a1).toContain("implementation project(':widget')");
    run();
    expect(readFileSync(join(dir, "settings.gradle"), "utf8")).toBe(s1);
    expect(readFileSync(join(dir, "build.gradle"), "utf8")).toBe(a1);
  });
  it("exits 1 with a message and writes nothing when the anchor is missing", () => {
    const dir = setup("dependencies {\n}\n");
    const r = spawnSync("node", [SCRIPT, join(dir, "settings.gradle"), join(dir, "build.gradle")], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/androidbrowserhelper/);
    expect(readFileSync(join(dir, "settings.gradle"), "utf8")).toBe(SETTINGS);
  });
  it("exits 1 on wrong usage", () => {
    const r = spawnSync("node", [SCRIPT], { encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});
