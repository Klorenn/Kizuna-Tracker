import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the root toolchain ignores mobile/ (it has its own package.json, tsconfig and eslint)", () => {
  it("tsconfig.json excludes mobile next to node_modules", () => {
    const ts = JSON.parse(readFileSync("tsconfig.json", "utf8")) as { exclude: string[] };
    expect(ts.exclude).toContain("mobile");
    expect(ts.exclude).toContain("node_modules");
  });
  // BLOCKED: the config-protection hook refuses edits to eslint.config.mjs; the user must add "mobile/**" to its ignores.
  it.todo('eslint.config.mjs ignores "mobile/**" (pending a manual one-line change)')
  it("vitest only collects tests/ and src/ (never mobile/)", () => {
    const cfg = readFileSync("vitest.config.ts", "utf8");
    expect(cfg).toContain('include: ["tests/**/*.test.ts", "src/**/*.test.ts"]');
  });
});
