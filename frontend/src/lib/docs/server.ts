import type { PublicDoc } from "./content";

const API_ORIGIN =
  process.env.INTERNAL_API_URL ??
  (process.env.NEXT_PUBLIC_API_BASE_URL
    ? process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/api\/v1\/?$/, "")
    : "http://localhost:8000");

type PublishedPage = {
  slug: string;
  title: string;
  excerpt?: string | null;
  content: string;
  youtube_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

export type PublishedCategory = {
  name: string;
  slug: string;
  description?: string | null;
  pages: Array<{ slug: string; title: string; excerpt?: string | null }>;
};

async function publicFetch<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/docs/public${path}`, {
      next: { revalidate: 60 },
    });
    return response.ok ? (await response.json()) as T : null;
  } catch {
    // Product docs remain available when the API is being deployed or restarted.
    return null;
  }
}

export async function getPublishedNavigation(): Promise<PublishedCategory[]> {
  return (await publicFetch<PublishedCategory[]>("/navigation")) ?? [];
}

function sectionsFromMarkdown(content: string): PublicDoc["sections"] {
  const blocks = content.split(/^##\s+/m).filter(Boolean);
  if (!blocks.length) return [{ id: "overview", title: "Overview", body: "This page is ready for content." }];
  return blocks.map((block, index) => {
    const [first = "Overview", ...rest] = block.trim().split("\n");
    const hasHeading = index > 0 || content.trimStart().startsWith("## ");
    const title = hasHeading ? first.replace(/^#+\s*/, "") : "Overview";
    const body = (hasHeading ? rest : [first, ...rest]).join("\n").trim() || "This section is ready for content.";
    return {
      id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `section-${index + 1}`,
      title,
      body,
    };
  });
}

function youtubeId(url?: string | null) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function getPublishedDoc(category: string, slug: string): Promise<PublicDoc | null> {
  const page = await publicFetch<PublishedPage>(`/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`);
  if (!page) return null;
  return {
    category,
    categoryLabel: category.split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" "),
    slug: page.slug,
    title: page.seo_title || page.title,
    description: page.seo_description || page.excerpt || "Workspace documentation.",
    tags: [category, "workspace"],
    sections: sectionsFromMarkdown(page.content),
    videoId: youtubeId(page.youtube_url),
  };
}
