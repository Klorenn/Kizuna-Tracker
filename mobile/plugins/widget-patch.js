// Pure string transforms for the prebuild-generated Gradle files (no Expo imports, so they are unit-testable).
// Ported from scripts/android-widget-patch.mjs, which does the same for Bubblewrap's TWA project.
const INCLUDE = "include ':widget'";
const DEPENDENCY = "implementation project(':widget')";
// The app module's own top-level dependencies block (column 0), not one nested inside android { }.
const ANCHOR = /^dependencies[ \t]*\{[ \t]*\n/m;

function patchSettings(text) {
  if (/^include ':widget'[ \t]*$/m.test(text)) return text;
  return `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}${INCLUDE}\n`;
}

function patchAppGradle(text) {
  if (text.includes(DEPENDENCY)) return text;
  const m = ANCHOR.exec(text);
  if (!m) {
    throw new Error("app/build.gradle: anchor `dependencies {` not found (did the Expo prebuild template change?)");
  }
  const at = m.index + m[0].length;
  return `${text.slice(0, at)}    ${DEPENDENCY}\n${text.slice(at)}`;
}

module.exports = { INCLUDE, DEPENDENCY, patchSettings, patchAppGradle };
