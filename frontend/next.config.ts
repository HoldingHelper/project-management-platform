import type { NextConfig } from "next";

// Runtime (server-side) API target for the /api/v1 proxy below. Because the
// browser only ever calls the relative `/api/v1/...`, one frontend image works
// in every compose configuration — no NEXT_PUBLIC_* build-time baking.
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Standalone output so the Docker runtime image is a thin `node server.js`.
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${INTERNAL_API_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
