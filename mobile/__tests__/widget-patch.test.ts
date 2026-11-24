import { DEPENDENCY, INCLUDE, patchAppGradle, patchSettings } from "../plugins/widget-patch";

const SETTINGS = `pluginManagement { includeBuild(new File(["node", "--print", "require.resolve('@react-native/gradle-plugin/package.json')"].execute().text.trim()).getParentFile().toString()) }
rootProject.name = 'Kizuna'
include ':app'
`;

const APP_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

android {
    namespace "com.kizunatracker.app"
    defaultConfig { versionCode 4 }
    dependencies { /* nested block must not be the anchor */ }
}

dependencies {
    // The version of react-android is set by the React Native Gradle Plugin
    implementation("com.facebook.react:react-android")

    if (hermesEnabled.toBoolean()) {
        implementation("com.facebook.react:hermes-android")
    }
}
`;

describe("patchSettings", () => {
  it("appends the include once", () => {
    const once = patchSettings(SETTINGS);
    expect(once).toBe(`${SETTINGS}${INCLUDE}\n`);
    expect(patchSettings(once)).toBe(once); // idempotent
  });
  it("adds the missing newline before the include, and handles an empty file", () => {
    expect(patchSettings("include ':app'")).toBe(`include ':app'\n${INCLUDE}\n`);
    expect(patchSettings("")).toBe(`${INCLUDE}\n`);
  });
  it("does not duplicate when the include is already there with other spacing at the end of line", () => {
    const text = `include ':app'\ninclude ':widget'   \n`;
    expect(patchSettings(text)).toBe(text);
  });
});

describe("patchAppGradle", () => {
  it("inserts the dependency right after the top-level dependencies { line", () => {
    const out = patchAppGradle(APP_GRADLE);
    const lines = out.split("\n");
    const at = lines.indexOf("dependencies {");
    expect(lines[at + 1]).toBe(`    ${DEPENDENCY}`);
    expect(lines[at + 2]).toContain("The version of react-android");
    expect(out.split(DEPENDENCY)).toHaveLength(2); // exactly once
  });
  it("leaves the nested android { dependencies { } } block alone", () => {
    expect(patchAppGradle(APP_GRADLE)).toContain("dependencies { /* nested block must not be the anchor */ }");
  });
  it("is idempotent", () => {
    const once = patchAppGradle(APP_GRADLE);
    expect(patchAppGradle(once)).toBe(once);
  });
  it("throws when the anchor is missing, naming what changed", () => {
    expect(() => patchAppGradle("android { }\n")).toThrow(/anchor `dependencies \{` not found/);
  });
});
