import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The route folder cannot start with "@" (Next treats it as a parallel slot).
  async rewrites() {
    return [{ source: "/@:username", destination: "/u/:username" }];
  },
};

export default nextConfig;
