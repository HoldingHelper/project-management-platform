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
      | "position"
      | "responsible_user_id"
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
