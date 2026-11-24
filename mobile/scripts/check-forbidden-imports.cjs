#!/usr/bin/env node
// Lint guard: mobile/ must never import Next, server-only code or Node built-ins. The shared whitelist test in the
// root repo checks the same rules transitively for src/ files; this one checks mobile's own sources.
// Usage: node scripts/check-forbidden-imports.mjs   (exit 1 on a violation)
const { existsSync, readdirSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

const FORBIDDEN = [
  /^next(\/.*)?$/,
  /^server-only$/,
  /^@\/lib\/supabase\/(server|admin|middleware|env\.server)$/,
  /^@\/app(\/.*)?$/,
  /^node:/,
  /^web-push$/,
];
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
const SKIP_DIRS = new Set(["node_modules", ".expo", "android", "ios", "__tests__", "scripts", "coverage"]);
const APP_DIRS = ["app", "src"];
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

/** @param {string} source @returns {string[]} the forbidden module specifiers, in order, once each */
function findForbiddenImports(source) {
  const found = [];
  for (const m of source.matchAll(SPECIFIER)) if (FORBIDDEN.some((re) => re.test(m[1])) && !found.includes(m[1])) found.push(m[1]);
  return found;
}

/** @param {string} dir @param {string[]} [out] @returns {string[]} */
function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) sources(p, out);
    } else if (SOURCE.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/** @param {string} mobileRoot @returns {{ files: number, violations: string[] }} */
function scanMobileSources(mobileRoot) {
  // Only what ships in the app bundle: app/ and src/. Config files and plugins (metro, jest, with-*.js) run in Node.
  const files = APP_DIRS.flatMap((d) => (existsSync(join(mobileRoot, d)) ? sources(join(mobileRoot, d)) : []));
  const violations = [];
  for (const f of files) for (const spec of findForbiddenImports(readFileSync(f, "utf8"))) violations.push(`${f}: imports forbidden "${spec}"`);
  return { files: files.length, violations };
}

module.exports = { findForbiddenImports, scanMobileSources };

if (require.main === module) {
  const { files, violations } = scanMobileSources(join(__dirname, ".."));
  if (violations.length) {
    console.error(violations.join("\n"));
    process.exit(1);
  }
  console.log(`ok: ${files} files, no forbidden imports`);
}
