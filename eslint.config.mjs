import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // A Promise in a condition is always truthy: `if (!authorizeCronRequest(req))` without await
    // would accept every request. Only the conditionals check is on (type-aware, so ts/tsx only).
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    rules: {
      "@typescript-eslint/no-misused-promises": ["error", { checksConditionals: true, checksVoidReturn: false, checksSpreads: false }],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".claude/**",
      "out/**",
      "supabase/.temp/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
