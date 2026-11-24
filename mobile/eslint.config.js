// Guard rail for the native app: mobile/ must never import Next, server-only code or Node built-ins.
// (`npm run lint:guard` and __tests__/forbidden-imports.test.ts enforce the same rules without ESLint installed.)
const FORBIDDEN = [
  { group: ["next", "next/*"], message: "mobile/ must not import Next." },
  { group: ["server-only"], message: "mobile/ must not import server-only code." },
  { group: ["@/lib/supabase/server", "@/lib/supabase/admin", "@/lib/supabase/middleware"], message: "Server Supabase clients are web-only." },
  { group: ["node:*", "web-push"], message: "Node-only modules do not run in React Native." },
];

module.exports = [
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: FORBIDDEN }] },
  },
];
