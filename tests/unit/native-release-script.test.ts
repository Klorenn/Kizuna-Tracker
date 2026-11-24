import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/native-release.sh");
const run = (...args: string[]) => spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8", cwd: process.cwd() });

describe("native-release.sh guards (all abort before any side effect)", () => {
  it("needs a version", () => expect(run().stderr).toMatch(/usage/));
  it("rejects non-semver", () => {
    const r = run("1.1");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/semver/);
  });
  it("rejects a minor jump (patch bumps only)", () => expect(run("1.2.0").stderr).toMatch(/patch bumps only/));
  it("rejects a version below 1.1.1", () => expect(run("1.0.9").stderr).toMatch(/>= 1\.1\.1/));
  it("rejects unknown options and two versions", () => {
    expect(run("--nope", "1.1.2").stderr).toMatch(/unknown option/);
    expect(run("1.1.2", "1.1.3").stderr).toMatch(/only one version/);
  });
});

describe("release wiring", () => {
  const script = readFileSync(SCRIPT, "utf8");
  it("pins the release key fingerprint of the TWA keystore", () => {
    expect(script).toContain("4A:89:D7:46:88:D5:26:1E:CF:45:1D:6E:34:09:17:25:B2:5C:17:66:9A:A7:17:62:5D:54:09:CF:13:FC:0B:D4");
  });
  it("builds the production profile non-interactively and publishes as Latest", () => {
    expect(script).toMatch(/eas build -p android --profile production --non-interactive --wait/);
    expect(script).toMatch(/gh release create "\$TAG" "\$APK_NAME" --latest/);
  });
  it("skips tag, push and release in --dry-run", () => {
    expect(script.indexOf("--dry-run: skipping")).toBeLessThan(script.indexOf('git tag "$TAG"'));
  });
  it("android-release.sh sources the shared checks", () => {
    expect(readFileSync(join(process.cwd(), "scripts/android-release.sh"), "utf8")).toContain("scripts/lib/apk-assert.sh");
  });
});

describe("eas.json", () => {
  const eas = JSON.parse(readFileSync(join(process.cwd(), "mobile/eas.json"), "utf8"));
  it("has the three channels", () => {
    expect(eas.build.development.channel).toBe("development");
    expect(eas.build.preview.channel).toBe("preview");
    expect(eas.build.production.channel).toBe("production");
  });
  it("production is a locally signed APK with a local version source", () => {
    expect(eas.cli.appVersionSource).toBe("local");
    expect(eas.build.production.credentialsSource).toBe("local");
    expect(eas.build.production.android.buildType).toBe("apk");
  });
});
