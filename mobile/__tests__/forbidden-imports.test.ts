import { findForbiddenImports, scanMobileSources } from "../scripts/check-forbidden-imports.cjs";

describe("findForbiddenImports", () => {
  it.each([
    ["next/headers", "import { cookies } from 'next/headers'"],
    ["next", "import next from 'next'"],
    ["server-only", "import 'server-only'"],
    ["@/lib/supabase/server", "import { createServerClient } from '@/lib/supabase/server'"],
    ["@/lib/supabase/admin", "export * from '@/lib/supabase/admin'"],
    ["node:fs", "const fs = require('node:fs')"],
    ["web-push", "import('web-push')"],
  ])("flags %s", (spec, line) => {
    expect(findForbiddenImports(line)).toEqual([spec]);
  });
  it("lets allowed imports through", () => {
    const src = "import { localDate } from '@/domain/dates'\nimport { Text } from 'react-native'\nimport x from './x'\nimport { nextTick } from 'next-tick-lib'";
    expect(findForbiddenImports(src)).toEqual([]);
  });
  it("reports every offender once, in order", () => {
    expect(findForbiddenImports("import 'server-only'\nimport 'next/link'\nimport 'server-only'")).toEqual(["server-only", "next/link"]);
  });
});

describe("scanMobileSources", () => {
  it("finds no forbidden import in the real mobile/ sources", () => {
    const result = scanMobileSources(`${__dirname}/..`);
    expect(result.files).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });
});
