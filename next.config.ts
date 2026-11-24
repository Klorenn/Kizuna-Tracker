import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

// Public static art: a week fresh, a month served stale while the browser revalidates. Not
// `immutable`: brand files are busted with the BRAND_ASSET_VERSION query (src/lib/brand-assets.ts).
const PUBLIC_ART_CACHE = "public, max-age=604800, stale-while-revalidate=2592000";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    // Client Router Cache: revisiting a tab within 30 s reuses the loaded RSC payload (instant, no ~150-200 ms round trip to
    // Oregon). `static` (180 s) applies to links with prefetch={true}. Server actions that call revalidatePath/revalidateTag
    // or cookies.set clear this cache, and router.refresh() bypasses it, so writes still show up.
    staleTimes: { dynamic: 30, static: 180 },
  },
  // The route folder cannot start with "@" (Next treats it as a parallel slot).
  async rewrites() {
    return [{ source: "/@:username", destination: "/u/:username" }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // only the files themselves: an extensionless path reaches middleware and must not get a public header
      { source: "/brand/:file([^/]+\\.(?:gif|png|webp))", headers: [{ key: "Cache-Control", value: PUBLIC_ART_CACHE }] },
      { source: "/avatars/:file([^/]+\\.(?:gif|png|webp))", headers: [{ key: "Cache-Control", value: PUBLIC_ART_CACHE }] },
    ];
  },
};

export default withSerwist(nextConfig);
