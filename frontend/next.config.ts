import type { NextConfig } from "next";

// Runtime (server-side) API target for the /api/v1 proxy below. Because the
// browser only ever calls the relative `/api/v1/...`, one frontend image works
// in every compose configuration — no NEXT_PUBLIC_* build-time baking.
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:8000";
const isExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  // Standalone output for Docker or export for S3/CloudFront static hosting
  output: isExport ? "export" : "standalone",
  ...(isExport ? { images: { unoptimized: true }, trailingSlash: true } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
  ...(isExport
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/v1/:path*",
              destination: `${INTERNAL_API_URL}/api/v1/:path*`,
            },
            { source: "/app/teams/portfolio", destination: "/portfolio" },
            { source: "/app/teams/tasks", destination: "/tasks" },
            { source: "/app/teams/tasks/:path*", destination: "/tasks/:path*" },
            { source: "/app/teams/timeline", destination: "/timeline" },
            { source: "/app/teams/projects/:path*", destination: "/projects/:path*" },
            { source: "/app/teams/notifications", destination: "/notifications" },
            { source: "/app/teams/activity", destination: "/activity" },
            { source: "/app/teams/performance", destination: "/performance" },
            { source: "/app/teams/dashboards/:path*", destination: "/dashboards/:path*" },
            { source: "/app/teams/admin/:path*", destination: "/admin/:path*" },
            { source: "/app/teams/settings", destination: "/settings" },
            { source: "/app/teams/profile/:path*", destination: "/profile/:path*" },
          ];
        },
      }),
};

export default nextConfig;
