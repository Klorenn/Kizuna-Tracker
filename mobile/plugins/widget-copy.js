const fs = require("node:fs");
const path = require("node:path");

/** Copies the android/widget library into the prebuild project, replacing an older copy and skipping `build/`. */
function copyWidgetLibrary(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`android/widget not found at ${src} (EAS uploads the git root; is the repo checkout complete?)`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => path.relative(src, p).split(path.sep)[0] !== "build",
  });
}

module.exports = { copyWidgetLibrary };
