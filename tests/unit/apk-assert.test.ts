import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LIB = join(process.cwd(), "scripts/lib/apk-assert.sh");
const EXPECTED = "4A:89:D7:46:88:D5:26:1E:CF:45:1D:6E:34:09:17:25:B2:5C:17:66:9A:A7:17:62:5D:54:09:CF:13:FC:0B:D4";
const HEX = EXPECTED.replaceAll(":", "").toLowerCase();

const GOOD_XML = `
      E: activity (line=1)
        A: android:name(0x01010003)="com.kizunatracker.widget.KizunaWidgetProvider"
        A: android:name(0x01010003)="com.kizunatracker.widget.WidgetSetupActivity"
        A: android:name(0x01010003)="android.permission.INTERNET"
        A: android:name(0x01010003)="android.appwidget.action.APPWIDGET_UPDATE"
        A: android:name(0x01010003)="android.appwidget.provider"
`;
const DEX = "  Class descriptor  : 'Lcom/kizunatracker/widget/KizunaWidgetProvider;'\n";

function tool(dir: string, name: string, body: string) {
  const p = join(dir, name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

/** Runs `source lib; <fn>` with fake build-tools; returns exit code and stderr. */
function run(call: (t: { dir: string }) => string, setup: (dir: string) => void, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "apk-assert-"));
  setup(dir);
  const script = `set -euo pipefail\ndie() { echo "error: $*" >&2; exit 1; }\nsource "${LIB}"\n${call({ dir })}`;
  const r = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, err: r.stderr, out: r.stdout };
}

describe("apk_assert_fingerprint", () => {
  const signer = (dir: string, hex: string) =>
    tool(dir, "apksigner", `echo "Verifies"; echo "Signer #1 certificate SHA-256 digest: ${hex}"`);
  it("passes with the release key", () => {
    const r = run(({ dir }) => `apk_assert_fingerprint "${dir}/apksigner" x.apk "${EXPECTED}"`, (d) => signer(d, HEX));
    expect(r.code).toBe(0);
  });
  it("aborts on another key", () => {
    const r = run(({ dir }) => `apk_assert_fingerprint "${dir}/apksigner" x.apk "${EXPECTED}"`, (d) => signer(d, "ab".repeat(32)));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/SHA-256 mismatch/);
  });
  it("aborts when apksigner prints no digest", () => {
    const r = run(({ dir }) => `apk_assert_fingerprint "${dir}/apksigner" x.apk "${EXPECTED}"`, (d) => tool(d, "apksigner", "echo nothing"));
    expect(r.code).toBe(1);
  });
  it("warns but passes with ANDROID_RELEASE_SKIP_FINGERPRINT=1", () => {
    const r = run(({ dir }) => `apk_assert_fingerprint "${dir}/apksigner" x.apk "${EXPECTED}"`, (d) => signer(d, "ab".repeat(32)), {
      ANDROID_RELEASE_SKIP_FINGERPRINT: "1",
    });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/WARNING: fingerprint check skipped/);
  });
});

describe("apk_assert_widget", () => {
  const call = ({ dir }: { dir: string }) => `apk_assert_widget "${dir}/aapt2" "${dir}/dexdump" x.apk`;
  const setup = (xml: string, dex: string) => (dir: string) => {
    tool(dir, "aapt2", `cat <<'X'\n${xml}\nX`);
    tool(dir, "dexdump", `cat <<'X'\n${dex}\nX`);
  };
  it("passes when manifest and dex have the widget", () => {
    expect(run(call, setup(GOOD_XML, DEX)).code).toBe(0);
  });
  it("aborts when the provider is missing from the manifest", () => {
    const r = run(call, setup(GOOD_XML.replace("KizunaWidgetProvider", "Other"), DEX));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/merged manifest lacks/);
  });
  it("aborts when WidgetSetupActivity is missing", () => {
    expect(run(call, setup(GOOD_XML.replace("WidgetSetupActivity", "X"), DEX)).code).toBe(1);
  });
  it("aborts when aapt2 fails", () => {
    const r = run(call, (d) => {
      tool(d, "aapt2", "exit 1");
      tool(d, "dexdump", `echo "${DEX}"`);
    });
    expect(r.err).toMatch(/aapt2 could not read/);
  });
  it("falls back to scanning classes*.dex when dexdump lacks the class", () => {
    const r = run(
      ({ dir }) => `cd "${dir}"; apk_assert_widget "${dir}/aapt2" "${dir}/dexdump" app.apk`,
      (d) => {
        tool(d, "aapt2", `cat <<'X'\n${GOOD_XML}\nX`);
        tool(d, "dexdump", "echo 'Class descriptor : something else'");
        spawnSync("bash", ["-c", `cd "${d}" && printf 'xx Lcom/kizunatracker/widget/KizunaWidgetProvider; yy' > classes.dex && zip -q app.apk classes.dex`]);
      },
    );
    expect(r.code).toBe(0);
  });
  it("aborts when neither dexdump nor the raw scan finds it (R8 stripped)", () => {
    const r = run(
      ({ dir }) => `cd "${dir}"; apk_assert_widget "${dir}/aapt2" "${dir}/dexdump" app.apk`,
      (d) => {
        tool(d, "aapt2", `cat <<'X'\n${GOOD_XML}\nX`);
        tool(d, "dexdump", "echo nothing");
        spawnSync("bash", ["-c", `cd "${d}" && printf 'unrelated' > classes.dex && zip -q app.apk classes.dex`]);
      },
    );
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/R8 removed the widget provider/);
  });
});
