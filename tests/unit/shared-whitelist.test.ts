import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeShared, expandGlobs, type FileSystemLike } from "./support/import-graph";

/** Builds an in-memory file system: path (relative to the repo root) to source text. */
const mem = (files: Record<string, string>): FileSystemLike => ({
  read: (p) => (p in files ? files[p] : null),
  list: () => Object.keys(files),
});

describe("analyzeShared (synthetic graphs)", () => {
  const ok = { "src/domain/a.ts": "import { b } from '@/lib/b'\nexport const a = b", "src/lib/b.ts": "import x from 'date-fns'\nexport const b = 1" };

  it("passes a closed graph and lists the external packages it uses", () => {
    const r = analyzeShared(mem(ok), ["src/domain/a.ts", "src/lib/b.ts"], ["date-fns"]);
    expect(r.violations).toEqual([]);
    expect(r.externals).toEqual(["date-fns"]);
  });
  it("flags a file reached transitively but missing from the whitelist", () => {
    const r = analyzeShared(mem(ok), ["src/domain/a.ts"], ["date-fns"]);
    expect(r.violations).toEqual(["src/domain/a.ts imports @/lib/b (src/lib/b.ts), which is not whitelisted"]);
  });
  it.each([
    ["next/headers", "import { cookies } from 'next/headers'"],
    ["next", "import n from 'next'"],
    ["server-only", "import 'server-only'"],
    ["@/lib/supabase/server", "import { createServerClient } from '@/lib/supabase/server'"],
    ["@/lib/supabase/admin", "export { createAdminClient } from '@/lib/supabase/admin'"],
    ["@/lib/supabase/middleware", "import('@/lib/supabase/middleware')"],
    ["@/app/(app)/page", "import p from '@/app/(app)/page'"],
    ["node:crypto", "import { createHash } from 'node:crypto'"],
    ["web-push", "import wp from 'web-push'"],
  ])("flags a forbidden import: %s", (spec, line) => {
    const r = analyzeShared(mem({ "src/lib/x.ts": line }), ["src/lib/x.ts"], []);
    expect(r.violations).toContain(`src/lib/x.ts imports forbidden "${spec}"`);
  });
  it("catches a forbidden import two hops away through a whitelisted file", () => {
    const files = { "src/lib/a.ts": "import { b } from './b'", "src/lib/b.ts": "import { c } from '@/lib/c'", "src/lib/c.ts": "import 'server-only'" };
    const r = analyzeShared(mem(files), ["src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts"], []);
    expect(r.violations).toEqual(['src/lib/c.ts imports forbidden "server-only"']);
  });
  it("flags an external package that is not declared", () => {
    const r = analyzeShared(mem({ "src/lib/x.ts": "import z from 'lodash'" }), ["src/lib/x.ts"], ["date-fns"]);
    expect(r.violations).toEqual(['src/lib/x.ts imports undeclared package "lodash"']);
  });
  it("flags a whitelisted path that does not exist", () => {
    expect(analyzeShared(mem({}), ["src/lib/gone.ts"], []).violations).toEqual(["whitelisted file src/lib/gone.ts does not exist"]);
  });
  it("resolves relative imports, index files and .tsx", () => {
    const files = { "src/lib/a.ts": "import './sub'\nimport { q } from './q'", "src/lib/sub/index.ts": "export {}", "src/lib/q.tsx": "export const q = 1" };
    expect(analyzeShared(mem(files), ["src/lib/a.ts", "src/lib/sub/index.ts", "src/lib/q.tsx"], []).violations).toEqual([]);
  });
});

describe("expandGlobs", () => {
  const fs = mem({ "src/domain/a.ts": "", "src/domain/sub/b.ts": "", "src/lib/c.ts": "" });
  it("expands ** and keeps exact paths", () => {
    expect(expandGlobs(fs, ["src/domain/**", "src/lib/c.ts"]).sort()).toEqual(["src/domain/a.ts", "src/domain/sub/b.ts", "src/lib/c.ts"]);
  });
});

describe("mobile/shared-whitelist.json against the real repo", () => {
  const wl = JSON.parse(readFileSync("mobile/shared-whitelist.json", "utf8")) as { files: string[]; externalPackages: string[] };
  const real: FileSystemLike = {
    read: (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } },
    list: () => walk("src"),
  };
  it("is closed under imports and free of forbidden or undeclared imports", () => {
    const r = analyzeShared(real, expandGlobs(real, wl.files), wl.externalPackages);
    expect(r.violations).toEqual([]);
    expect(r.checked).toBeGreaterThan(30);
  });
});

import { readdirSync, statSync } from "node:fs";
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
