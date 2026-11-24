import { describe, expect, it } from "vitest";
import {
  assertApkIdentity,
  assertReleasable,
  parseBadging,
  parseSemver,
  readAppConfig,
  rewriteAppConfig,
} from "../../scripts/native-release-lib.mjs";

const CONFIG = `export default () => ({
  version: "1.1.1",
  android: {
    package: "com.kizunatracker.app",
    versionCode: 5,
  },
});
`;

describe("parseSemver", () => {
  it("parses X.Y.Z", () => expect(parseSemver("1.1.2")).toEqual([1, 1, 2]));
  it.each(["1.1", "v1.1.2", "1.1.2-beta", "1.01.2", "", "a.b.c", "1.1.2.3"])("rejects %s", (v) =>
    expect(() => parseSemver(v)).toThrow(/semver/),
  );
});

describe("assertReleasable", () => {
  const cur = { version: "1.1.1", versionCode: 5 };
  it("accepts the current version and the next patch", () => {
    expect(assertReleasable("1.1.1", cur)).toBe(6);
    expect(assertReleasable("1.1.2", cur)).toBe(6);
  });
  it("rejects minor/major jumps, patch skips and downgrades", () => {
    expect(() => assertReleasable("1.2.0", cur)).toThrow(/patch/);
    expect(() => assertReleasable("2.0.0", cur)).toThrow(/patch/);
    expect(() => assertReleasable("1.1.3", cur)).toThrow(/patch/);
    expect(() => assertReleasable("1.1.0", cur)).toThrow(/1\.1\.1/);
  });
  it("never yields a versionCode below 4 (the TWA is 3)", () => {
    expect(assertReleasable("1.1.1", { version: "1.1.1", versionCode: 1 })).toBe(4);
  });
});

describe("app.config.ts rewrite", () => {
  it("reads version and versionCode", () => expect(readAppConfig(CONFIG)).toEqual({ version: "1.1.1", versionCode: 5 }));
  it("rewrites only those two values", () => {
    const out = rewriteAppConfig(CONFIG, "1.1.2", 6);
    expect(out).toBe(CONFIG.replace('"1.1.1"', '"1.1.2"').replace("versionCode: 5", "versionCode: 6"));
  });
  it("throws when an anchor is missing or duplicated", () => {
    expect(() => rewriteAppConfig("version: \"1.0.0\"", "1.1.2", 6)).toThrow(/versionCode/);
    expect(() => rewriteAppConfig(`${CONFIG}\nversion: "2.0.0",`, "1.1.2", 6)).toThrow(/version/);
  });
});

describe("badging", () => {
  const OUT = "package: name='com.kizunatracker.app' versionCode='6' versionName='1.1.2' platformBuildVersionName='15'\nsdkVersion:'24'\n";
  it("parses package and versionCode", () => expect(parseBadging(OUT)).toEqual({ name: "com.kizunatracker.app", versionCode: 6 }));
  it("passes the right package with a greater versionCode", () => {
    expect(() => assertApkIdentity(OUT, { name: "com.kizunatracker.app", greaterThan: 5 })).not.toThrow();
  });
  it("aborts on another package, an equal/lower versionCode or garbage", () => {
    expect(() => assertApkIdentity(OUT, { name: "com.kizunatracker.app.dev", greaterThan: 5 })).toThrow(/package/);
    expect(() => assertApkIdentity(OUT, { name: "com.kizunatracker.app", greaterThan: 6 })).toThrow(/versionCode/);
    expect(() => assertApkIdentity("nope", { name: "x", greaterThan: 1 })).toThrow(/badging/);
  });
});
