/** Import-graph checker behind tests/unit/shared-whitelist.test.ts: what the native app may share from src/. */
export interface FileSystemLike {
  /** Source text of a repo-relative path, or null when it does not exist. */
  read(path: string): string | null;
  /** Every repo-relative file path under src/. */
  list(): string[];
}

export type Analysis = { violations: string[]; externals: string[]; checked: number };

const FORBIDDEN: RegExp[] = [
  /^next(\/.*)?$/,
  /^server-only$/,
  /^@\/lib\/supabase\/(server|admin|middleware|env\.server)$/,
  /^@\/app(\/.*)?$/,
  /^node:/,
  /^web-push$/,
];

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx"];

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function resolveFile(fs: FileSystemLike, base: string): string | null {
  for (const ext of EXTENSIONS) if (fs.read(base + ext) !== null) return base + ext;
  return null;
}

export function specifiersOf(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map((m) => m[1]);
}

const packageName = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

/**
 * Walks `whitelist` and everything it imports. A violation is: a forbidden import, a reached src file that is not
 * whitelisted, an undeclared external package, or a whitelisted path that does not exist.
 */
export function analyzeShared(fs: FileSystemLike, whitelist: string[], declaredPackages: string[]): Analysis {
  const allowed = new Set(whitelist);
  const violations: string[] = [];
  const externals = new Set<string>();
  const seen = new Set<string>();
  const queue = [...whitelist];

  for (const f of whitelist) if (fs.read(f) === null) violations.push(`whitelisted file ${f} does not exist`);

  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.read(file);
    if (source === null) continue;
    for (const spec of specifiersOf(source)) {
      if (FORBIDDEN.some((re) => re.test(spec))) {
        violations.push(`${file} imports forbidden "${spec}"`);
        continue;
      }
      const local = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? normalize(`${dirname(file)}/${spec}`) : null;
      if (local === null) {
        const pkg = packageName(spec);
        if (declaredPackages.includes(pkg)) externals.add(pkg);
        else violations.push(`${file} imports undeclared package "${spec}"`);
        continue;
      }
      const target = resolveFile(fs, local);
      if (target === null) {
        violations.push(`${file} imports ${spec}, which does not resolve`);
      } else if (!allowed.has(target)) {
        violations.push(`${file} imports ${spec} (${target}), which is not whitelisted`);
      } else queue.push(target);
    }
  }
  return { violations: [...new Set(violations)].sort(), externals: [...externals].sort(), checked: seen.size };
}

/** Expands `dir/**` globs and exact paths against the file list. */
export function expandGlobs(fs: FileSystemLike, patterns: string[]): string[] {
  const all = fs.list();
  const out = new Set<string>();
  for (const p of patterns) {
    if (p.endsWith("/**")) {
      for (const f of all) if (f.startsWith(p.slice(0, -2))) out.add(f);
    } else if (!p.includes("*")) out.add(p);
  }
  return [...out];
}
