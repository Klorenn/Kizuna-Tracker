import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// Public static art keeps its name when it changes, so no `immutable`: a week fresh, a month
// served stale while the browser revalidates in the background. Rename a file to bust it at once.
const PUBLIC_ART_CACHE = "public, max-age=604800, stale-while-revalidate=2592000";

const nextConfig: NextConfig = {
  experimental: { optimizePackageImports: ["@phosphor-icons/react"] },
  // The route folder cannot start with "@" (Next treats it as a parallel slot).
  async rewrites() {
    return [{ source: "/@:username", destination: "/u/:username" }];
  },
  async headers() {
    return [
      { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: PUBLIC_ART_CACHE }] },
      { source: "/avatars/:path*", headers: [{ key: "Cache-Control", value: PUBLIC_ART_CACHE }] },
    ];
  },
};

export default withSerwist(nextConfig);
