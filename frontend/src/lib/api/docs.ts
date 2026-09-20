import { apiFetch } from "./client";
export type DocCategory = "Technical" | "Marketing" | "Operations" | "Platform" | "Business" | "Designs";
export type DocSpace = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  category: DocCategory | string;
  responsible_user_id?: string | null;
  visibility: string;
  position: number;
  created_at: string;
  updated_at: string;
};
export type DocPageSummary = {
  id: string;
  space_id: string;
  parent_page_id?: string | null;
  title: string;
  slug: string;
  excerpt?: string | null;
  status: string;
  visibility: string;
  doc_type?: string;
  tags?: string[];
  responsible_user_id?: string | null;
  position: number;
  updated_at: string;
};
export type DocPage = DocPageSummary & {
  content: string;
  content_json: Record<string, unknown>;
  youtube_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  doc_type?: string;
  tags?: string[];
  created_by: string;
  updated_by: string;
  created_at: string;
};
export type DocRevision = {
  id: string;
  page_id: string;
  revision_number: number;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
};
export type DocComment = {
  id: string;
  page_id: string;
  author_user_id: string;
  body: string;
  selection_start?: number | null;
  selection_end?: number | null;
  selected_text?: string | null;
  created_at: string;
};
export type DocPermission = {
  id?: string;
  resource_type?: string;
  resource_id?: string;
  subject_type: "user" | "role" | "team" | "department";
  subject_id: string;
  permission: "view" | "comment" | "edit" | "manage";
};
export type DocLink = {
  id: string;
  page_id: string;
  entity_type: "project" | "task" | "team" | "user";
  entity_id: string;
  created_at: string;
};
export type EntityDocLink = DocLink & {
  title: string;
  slug: string;
  space_id: string;
  excerpt?: string | null;
};
export type DocAttachment = {
  id: string;
  page_id: string;
  file_name: string;
  file_url?: string | null;
  mime_type: string;
  uploaded_by: string;
  size_bytes?: number | null;
  stored?: boolean;
  created_at: string;
};
export const listDocSpaces = (category?: string) =>
  apiFetch<DocSpace[]>(`/docs/spaces${category && category !== "all" ? `?category=${encodeURIComponent(category)}` : ""}`);
export const createDocSpace = (body: {
  name: string;
  description?: string;
  category?: DocCategory | string;
  responsible_user_id?: string | null;
  visibility?: string;
}) => apiFetch<DocSpace>("/docs/spaces", { method: "POST", body });
export const updateDocSpace = (
  spaceId: string,
  body: Partial<{
    name: string;
    description?: string;
    category?: DocCategory | string;
    responsible_user_id?: string | null;
    visibility?: string;
    position?: number;
  }>
) => apiFetch<DocSpace>(`/docs/spaces/${spaceId}`, { method: "PATCH", body });
export const listDocPages = (spaceId?: string, category?: string) => {
  const q = new URLSearchParams();
  if (spaceId) q.set("space_id", spaceId);
  if (category && category !== "All" && category !== "all") q.set("category", category);
  const qs = q.toString();
  return apiFetch<DocPageSummary[]>(`/docs/pages${qs ? `?${qs}` : ""}`);
};
export const listRecentDocPages = (category?: string) =>
  apiFetch<DocPageSummary[]>(`/docs/recent${category && category !== "All" && category !== "all" ? `?category=${encodeURIComponent(category)}` : ""}`);
export const listFavoriteDocPages = (category?: string) =>
  apiFetch<DocPageSummary[]>(`/docs/favorites${category && category !== "All" && category !== "all" ? `?category=${encodeURIComponent(category)}` : ""}`);
export const searchDocPages = (query: string, category?: string) => {
  const q = new URLSearchParams({ q: query });
  if (category && category !== "All" && category !== "all") q.set("category", category);
  return apiFetch<DocPageSummary[]>(`/docs/search?${q.toString()}`);
};
export const createDocPage = (
  spaceId: string,
  body: {
    title: string;
    content?: string;
    parent_page_id?: string | null;
    responsible_user_id?: string | null;
    visibility?: string;
    doc_type?: string;
  }
) => apiFetch<DocPage>(`/docs/spaces/${spaceId}/pages`, { method: "POST", body });
export const getDocPage = (pageId: string) => apiFetch<DocPage>(`/docs/pages/${pageId}`);
export const updateDocPage = (
  pageId: string,
  body: Partial<
    Pick<
      DocPage,
      | "title"
      | "content"
      | "content_json"
      | "visibility"
      | "youtube_url"
      | "seo_title"
      | "seo_description"
      | "parent_page_id"
      | "responsible_user_id"
      | "position"
      | "doc_type"
    >
  >
) => apiFetch<DocPage>(`/docs/pages/${pageId}`, { method: "PATCH", body });
export const moveDocPage = (
  pageId: string,
  body: { parent_page_id?: string | null; before_page_id?: string | null }
) => apiFetch<DocPage>(`/docs/pages/${pageId}/move`, { method: "POST", body });
export const publishDocPage = (pageId: string, published = true) =>
  apiFetch<DocPage>(`/docs/pages/${pageId}/${published ? "publish" : "unpublish"}`, { method: "POST" });
export const favoriteDocPage = (pageId: string, enabled = true) =>
  apiFetch<void>(`/docs/pages/${pageId}/favorite?enabled=${enabled}`, { method: "PUT" });
export const listDocRevisions = (pageId: string) =>
  apiFetch<DocRevision[]>(`/docs/pages/${pageId}/revisions`);
export const restoreDocRevision = (pageId: string, revisionId: string) =>
  apiFetch<DocPage>(`/docs/pages/${pageId}/revisions/${revisionId}/restore`, { method: "POST" });
export const listDocComments = (pageId: string) =>
  apiFetch<DocComment[]>(`/docs/pages/${pageId}/comments`);
export const addDocComment = (pageId: string, body: string) =>
  apiFetch<DocComment>(`/docs/pages/${pageId}/comments`, { method: "POST", body: { body } });
export const addAnchoredDocComment = (
  pageId: string,
  body: string,
  anchor: { selection_start: number; selection_end: number; selected_text: string },
) => apiFetch<DocComment>(`/docs/pages/${pageId}/comments`, { method: "POST", body: { body, ...anchor } });
export const listDocPermissions = (pageId: string) =>
  apiFetch<DocPermission[]>(`/docs/page/${pageId}/permissions`);
export const replaceDocPermissions = (pageId: string, grants: DocPermission[]) =>
  apiFetch<void>(`/docs/page/${pageId}/permissions`, {
    method: "PUT",
    body: grants.map(({ subject_type, subject_id, permission }) => ({ subject_type, subject_id, permission })),
  });
export const listSpacePermissions = (spaceId: string) =>
  apiFetch<DocPermission[]>(`/docs/spaces/${spaceId}/permissions`);
export const replaceSpacePermissions = (spaceId: string, grants: DocPermission[]) =>
  apiFetch<void>(`/docs/spaces/${spaceId}/permissions`, {
    method: "PUT",
    body: grants.map(({ subject_type, subject_id, permission }) => ({ subject_type, subject_id, permission })),
  });
export const listDocLinks = (pageId: string) =>
  apiFetch<DocLink[]>(`/docs/pages/${pageId}/links`);
export const addDocLink = (pageId: string, body: Pick<DocLink, "entity_type" | "entity_id">) =>
  apiFetch<DocLink>(`/docs/pages/${pageId}/links`, { method: "POST", body });
export const listEntityDocLinks = (entityType: DocLink["entity_type"], entityId: string) =>
  apiFetch<EntityDocLink[]>(`/docs/entity-links/${entityType}/${entityId}`);
export const deleteDocLink = (pageId: string, linkId: string) =>
  apiFetch<void>(`/docs/pages/${pageId}/links/${linkId}`, { method: "DELETE" });
export const listDocAttachments = (pageId: string) =>
  apiFetch<DocAttachment[]>(`/docs/pages/${pageId}/attachments`);
export const addDocAttachment = (
  pageId: string,
  body: Pick<DocAttachment, "file_name" | "file_url" | "mime_type">
) => apiFetch<DocAttachment>(`/docs/pages/${pageId}/attachments`, { method: "POST", body });
export const uploadDocAttachment = (pageId: string, file: File) => {
  const formData = new FormData();
  formData.set("file", file);
  return apiFetch<DocAttachment>(`/docs/pages/${pageId}/attachments/upload`, {
    method: "POST",
    formData,
  });
};
export const getDocAttachmentDownloadUrl = (attachmentId: string) =>
  apiFetch<{ url: string }>(`/docs/attachments/${attachmentId}/download-url`);

export type PublicDocNavigation = {
  name: string;
  slug: string;
  description?: string | null;
  pages: Array<{ id: string; slug: string; title: string; excerpt?: string | null }>;
};
export const listPublicDocNavigation = () =>
  apiFetch<PublicDocNavigation[]>("/docs/public/navigation", { auth: false });
export const getPublicDocPage = (pageId: string) =>
  apiFetch<DocPage>(`/docs/public/pages/${pageId}`, { auth: false });

// --- Knowledge Workspace Types & APIs ---

export type DocRelation = {
  id: string;
  source_page_id: string;
  target_page_id?: string | null;
  target_title: string;
  relation_type: string;
  anchor_text?: string | null;
  confidence: string;
  confidence_score: number;
  created_at: string;
};

export type DocTag = {
  id: string;
  name: string;
  color?: string | null;
  page_count: number;
};

export type DocSource = {
  id: string;
  space_id?: string | null;
  page_id?: string | null;
  title: string;
  source_type: "url" | "pdf" | "code" | "text" | "adr" | "runbook" | string;
  source_url?: string | null;
  content_text: string;
  metadata_json?: Record<string, unknown>;
  status: "pending" | "processing" | "ready" | "failed";
  error_message?: string | null;
  chunk_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type GraphNode = {
  id: string;
  label: string;
  title?: string;
  doc_type: string;
  category?: string;
  space_id?: string | null;
  degree: number;
  is_stub?: boolean;
  group?: string | null;
};

export type GraphEdge = {
  source: string;
  target: string;
  relation_type: string;
  confidence_score?: number;
  weight?: number;
};

export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_nodes?: number;
  total_edges?: number;
};

export type SearchResultItem = {
  id: string;
  result_type: "page" | "source" | "section";
  title: string;
  slug: string;
  space_id: string;
  space_name?: string | null;
  excerpt?: string | null;
  snippet_html?: string | null;
  matching_field: string;
  rank_score: number;
  doc_type: string;
  tags?: string[];
  updated_at?: string;
};

export type SearchResponse = {
  query: string;
  total: number;
  results: SearchResultItem[];
};

export type AICitation = {
  citation_index: number;
  source_type: "page" | "source";
  page_id?: string | null;
  source_id?: string | null;
  source_title: string;
  page_slug?: string | null;
  space_slug?: string | null;
  text_anchor?: string | null;
};

export type AIChatRequest = {
  session_id?: string | null;
  question: string;
  context_page_ids?: string[];
  context_source_ids?: string[];
  action?: "summarize" | "adr" | "runbook" | "checklist" | "explain" | "contradictions" | null;
};

export const listPageBacklinks = (pageId: string) =>
  apiFetch<DocRelation[]>(`/docs/pages/${pageId}/backlinks`);

export const getWikilinkSuggestions = (q: string, spaceId?: string) =>
  apiFetch<Array<{ title: string; slug: string; space_id: string; doc_type: string; exists: boolean }>>(
    `/docs/wikilink-suggestions?q=${encodeURIComponent(q)}${spaceId ? `&space_id=${encodeURIComponent(spaceId)}` : ""}`
  );

export const searchDocsV2 = (params: {
  q: string;
  space_id?: string;
  tag?: string;
  doc_type?: string;
  limit?: number;
}) => {
  const qs = new URLSearchParams();
  qs.set("q", params.q);
  if (params.space_id) qs.set("space_id", params.space_id);
  if (params.tag) qs.set("tag", params.tag);
  if (params.doc_type) qs.set("doc_type", params.doc_type);
  if (params.limit) qs.set("limit", params.limit.toString());
  return apiFetch<SearchResponse>(`/docs/search/v2?${qs.toString()}`);
};

export const quickSearchDocs = (q: string, limit = 10) =>
  apiFetch<SearchResultItem[]>(`/docs/search/quick?q=${encodeURIComponent(q)}&limit=${limit}`);

export const getLocalGraph = (pageId: string, depth = 1) =>
  apiFetch<GraphResponse>(`/docs/graph/local?page_id=${encodeURIComponent(pageId)}&depth=${depth}`);

export const getGlobalGraph = (spaceId?: string) =>
  apiFetch<GraphResponse>(`/docs/graph/global${spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : ""}`);

export const listDocSources = (spaceId?: string) =>
  apiFetch<DocSource[]>(`/docs/sources${spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : ""}`);

export const createDocSource = (body: {
  title: string;
  source_type: string;
  space_id?: string;
  url?: string;
  content?: string;
  meta_info?: Record<string, unknown>;
}) => apiFetch<DocSource>("/docs/sources", { method: "POST", body });

export const deleteDocSource = (sourceId: string) =>
  apiFetch<void>(`/docs/sources/${sourceId}`, { method: "DELETE" });

export const listDocTags = () =>
  apiFetch<DocTag[]>("/docs/tags");

export const addDocPageTag = (pageId: string, tag: string) =>
  apiFetch<void>(`/docs/pages/${pageId}/tags/${encodeURIComponent(tag)}`, { method: "POST" });

export const removeDocPageTag = (pageId: string, tag: string) =>
  apiFetch<void>(`/docs/pages/${pageId}/tags/${encodeURIComponent(tag)}`, { method: "DELETE" });

export async function streamKnowledgeChat(
  req: AIChatRequest,
  callbacks: {
    onCitations?: (citations: AICitation[]) => void;
    onToken?: (token: string) => void;
    onDone?: (sessionId: string, messageId?: string) => void;
    onError?: (err: Error) => void;
  }
) {
  try {
    const { getAccessToken } = await import("@/lib/auth/token-store");
    const { API_BASE_URL } = await import("./client");
    const token = getAccessToken();

    const response = await fetch(`${API_BASE_URL}/docs/ai/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is null");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "citations" && callbacks.onCitations) {
              callbacks.onCitations(data.citations);
            } else if (data.type === "token" && callbacks.onToken) {
              callbacks.onToken(data.content);
            } else if (data.type === "done" && callbacks.onDone) {
              callbacks.onDone(data.session_id, data.message_id);
            }
          } catch (e) {
            console.error("Failed to parse SSE event", e, line);
          }
        }
      }
    }
  } catch (err: any) {
    if (callbacks.onError) {
      callbacks.onError(err);
    } else {
      console.error("AI Chat stream error:", err);
    }
  }
}

