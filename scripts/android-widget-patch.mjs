#!/usr/bin/env node
// Links the android/widget library module into the Bubblewrap-generated project.
// `bubblewrap update` rewrites settings.gradle and app/build.gradle, so android-release.sh runs this
// right after it. Idempotent; throws (CLI exit 1) when Bubblewrap's layout no longer has our anchors.
// Usage: node scripts/android-widget-patch.mjs <settings.gradle> <app/build.gradle>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const INCLUDE = "include ':widget'";
const DEPENDENCY = "implementation project(':widget')";
const ANCHOR = /^[ \t]*implementation 'com\.google\.androidbrowserhelper:androidbrowserhelper:[^']+'[ \t]*\n/m;

export function patchSettings(text) {
  if (/^include ':widget'[ \t]*$/m.test(text)) return text;
  return `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}${INCLUDE}\n`;
}

export function patchAppGradle(text) {
  if (text.includes(DEPENDENCY)) return text;
  const m = ANCHOR.exec(text);
  if (!m) {
    throw new Error(
      "app/build.gradle: anchor `implementation 'com.google.androidbrowserhelper:androidbrowserhelper:...'` not found (did Bubblewrap change its layout?)",
    );
  }
  const at = m.index + m[0].length;
  return `${text.slice(0, at)}    ${DEPENDENCY}\n${text.slice(at)}`;
}

function main(argv) {
  if (argv.length !== 2) {
    console.error("usage: android-widget-patch.mjs <settings.gradle> <app/build.gradle>");
    return 1;
  }
  const [settingsPath, appPath] = argv;
  try {
    const settings = readFileSync(settingsPath, "utf8");
    const app = readFileSync(appPath, "utf8");
    // Compute both first so a failure never leaves a half-patched project.
    const nextSettings = patchSettings(settings);
    const nextApp = patchAppGradle(app);
    if (nextSettings !== settings) writeFileSync(settingsPath, nextSettings);
    if (nextApp !== app) writeFileSync(appPath, nextApp);
    return 0;
  } catch (e) {
    console.error(`android-widget-patch: ${e instanceof Error ? e.message : e}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
