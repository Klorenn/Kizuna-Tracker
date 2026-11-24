#!/usr/bin/env node
// Pure helpers for native-release.sh (semver/bump logic, app.config.ts rewrite, aapt2 badging checks).
// CLI (used by the shell script, exit 1 + message on stderr when it throws):
//   node native-release-lib.mjs plan <app.config.ts> <version>            -> prints the new versionCode
//   node native-release-lib.mjs apply <app.config.ts> <version> <code>    -> rewrites the file
//   node native-release-lib.mjs identity <package> <greaterThan>          -> reads `aapt2 dump badging` on stdin
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The TWA is versionCode 3; the native app must outrank it.
export const MIN_VERSION_CODE = 4;
export const MIN_VERSION = [1, 1, 1];

export function parseSemver(v) {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(v));
  if (!m) throw new Error(`version must be semver X.Y.Z, got '${v}'`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Patch bumps only (current or current+1), never below 1.1.1. Returns the new versionCode (current + 1, >= 4). */
export function assertReleasable(version, current) {
  const next = parseSemver(version);
  const cur = parseSemver(current.version);
  const below = next[0] !== MIN_VERSION[0] ? next[0] < MIN_VERSION[0] : next[1] !== MIN_VERSION[1] ? next[1] < MIN_VERSION[1] : next[2] < MIN_VERSION[2];
  if (below) throw new Error(`version must be >= ${MIN_VERSION.join(".")}, got ${version}`);
  const samePatchLine = next[0] === cur[0] && next[1] === cur[1];
  if (!samePatchLine || (next[2] !== cur[2] && next[2] !== cur[2] + 1)) {
    throw new Error(`patch bumps only: expected ${cur.join(".")} or ${cur[0]}.${cur[1]}.${cur[2] + 1}, got ${version}`);
  }
  return Math.max(current.versionCode + 1, MIN_VERSION_CODE);
}

const VERSION_RE = /^(\s*)version: "([^"]*)"/gm;
const CODE_RE = /^(\s*)versionCode: (\d+)/gm;

export function readAppConfig(src) {
  const v = [...src.matchAll(VERSION_RE)];
  const c = [...src.matchAll(CODE_RE)];
  if (v.length !== 1) throw new Error("app.config.ts: expected exactly one `version:`");
  if (c.length !== 1) throw new Error("app.config.ts: expected exactly one `versionCode:`");
  return { version: v[0][2], versionCode: Number(c[0][2]) };
}

export function rewriteAppConfig(src, version, versionCode) {
  readAppConfig(src); // validates the anchors
  return src.replace(VERSION_RE, `$1version: "${version}"`).replace(CODE_RE, `$1versionCode: ${versionCode}`);
}

export function parseBadging(text) {
  const m = /^package: name='([^']+)' versionCode='(\d+)'/m.exec(text);
  return m ? { name: m[1], versionCode: Number(m[2]) } : null;
}

export function assertApkIdentity(badging, { name, greaterThan }) {
  const info = parseBadging(badging);
  if (!info) throw new Error("could not read the APK badging (aapt2 dump badging)");
  if (info.name !== name) throw new Error(`wrong package: expected ${name}, got ${info.name}`);
  if (info.versionCode <= greaterThan) throw new Error(`versionCode ${info.versionCode} must be greater than ${greaterThan}`);
}

function main(argv) {
  const [cmd, ...a] = argv;
  if (cmd === "plan") {
    const src = readFileSync(a[0], "utf8");
    console.log(assertReleasable(a[1], readAppConfig(src)));
  } else if (cmd === "apply") {
    writeFileSync(a[0], rewriteAppConfig(readFileSync(a[0], "utf8"), a[1], Number(a[2])));
  } else if (cmd === "identity") {
    assertApkIdentity(readFileSync(0, "utf8"), { name: a[0], greaterThan: Number(a[1]) });
  } else {
    throw new Error("usage: native-release-lib.mjs plan|apply|identity ...");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
