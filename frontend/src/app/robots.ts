import type { MetadataRoute } from "next";

export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://pmp-frontend-706796253833.europe-west1.run.app";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/product", "/features", "/docs", "/tutorials", "/resources", "/about", "/login", "/privacy", "/terms"],
      disallow: ["/app", "/api"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
