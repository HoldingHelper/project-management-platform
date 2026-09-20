"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenText,
  Clock3,
  FilePlus2,
  FolderPlus,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";
import { Button, Modal, TextInput, TextArea } from "@/components/ds";
import { AppError } from "@/lib/api/client";
import {
  createDocPage,
  createDocSpace,
  listDocPages,
  listDocSpaces,
  listFavoriteDocPages,
  listRecentDocPages,
  searchDocPages,
  type DocCategory,
  type DocPageSummary,
} from "@/lib/api/docs";
import { listUsers } from "@/lib/api/users";

const CATEGORIES: (DocCategory | "All")[] = [
  "All",
  "Technical",
  "Marketing",
  "Operations",
  "Platform",
  "Business",
  "Designs",
];

function InternalDocsHomeContent() {
  const client = useQueryClient();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  const viewParam = searchParams.get("view");
  const view = (viewParam === "recent" || viewParam === "favorites" || viewParam === "search" || viewParam === "all-pages" || viewParam === "settings")
    ? viewParam
    : "all";

  const initialCategory = (categoryParam && CATEGORIES.includes(categoryParam as any))
    ? (categoryParam as DocCategory)
    : "All";
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<DocCategory | "All">(initialCategory);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<DocCategory>("Platform");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [selectedSpace, setSelectedSpace] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (categoryParam && CATEGORIES.includes(categoryParam as any)) {
      setSelectedCategory(categoryParam as DocCategory);
    }
  }, [categoryParam]);

  useEffect(() => {
    window.localStorage.setItem("workspace.last-module", "docs");
    if (view === "search") {
      searchRef.current?.focus();
    }
  }, [view]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const spaces = useQuery({
    queryKey: ["doc-spaces", selectedCategory],
    queryFn: () => listDocSpaces(selectedCategory === "All" ? undefined : selectedCategory),
    retry: 1,
  });
  const usersQuery = useQuery({ queryKey: ["users-list"], queryFn: () => listUsers({ page_size: 100 }) });
  const pages = useQuery({
    queryKey: ["doc-pages", view, selectedCategory],
    queryFn: () => {
      const cat = selectedCategory === "All" ? undefined : selectedCategory;
      return view === "recent"
        ? listRecentDocPages(cat)
        : view === "favorites"
        ? listFavoriteDocPages(cat)
        : listDocPages(undefined, cat);
    },
    retry: 1,
  });
  const allPages = useQuery<DocPageSummary[]>({
    queryKey: ["doc-pages", "all-list", selectedCategory],
    queryFn: () => listDocPages(undefined, selectedCategory === "All" ? undefined : selectedCategory),
    enabled: view === "all-pages" || view === "settings",
    retry: 1,
  });
  const searched = useQuery({
    queryKey: ["doc-search", debouncedQuery, selectedCategory],
    queryFn: () => searchDocPages(debouncedQuery, selectedCategory === "All" ? undefined : selectedCategory),
    enabled: debouncedQuery.length >= 2,
    retry: 1,
  });

  const filtered = useMemo(() => {
    const source = debouncedQuery.length >= 2 ? searched.data ?? [] : pages.data ?? [];
    return source.slice(0, 20);
  }, [pages.data, searched.data, debouncedQuery]);

  async function createSpace() {
    if (!name.trim()) return;
    setSaving(true);
    setFormError("");
    try {
      await createDocSpace({
        name: name.trim(),
        description: description.trim() || undefined,
        category: category,
        responsible_user_id: responsibleUserId || undefined,
      });
      await client.invalidateQueries({ queryKey: ["doc-spaces"] });
      setSpaceOpen(false);
      setName("");
      setDescription("");
      setCategory("Platform");
      setResponsibleUserId("");
    } catch (error) {
      setFormError(
        error instanceof AppError
          ? error.message
          : "The space could not be created. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createPage() {
    if (!name.trim() || !selectedSpace) return;
    setSaving(true);
    setFormError("");
    try {
      const page = await createDocPage(selectedSpace, { title: name.trim() });
      window.location.assign(`/app/docs/spaces/${selectedSpace}/${page.id}`);
    } catch (error) {
      setFormError(
        error instanceof AppError
          ? error.message
          : "The page could not be created. Check your connection and try again.",
      );
      setSaving(false);
    }
  }

  const failed = spaces.isError || pages.isError || searched.isError;

  return (
    <div className="internal-docs-home">
      <header>
        <div>
          <span className="pmp-eyebrow">Private workspace</span>
          <h1>
            {view === "recent"
              ? "Recently viewed"
              : view === "favorites"
              ? "Favorite pages"
              : view === "search"
              ? "Search Knowledge"
              : view === "all-pages"
              ? "All Documentation Pages"
              : view === "settings"
              ? "Documentation Settings"
              : "Internal Knowledge"}
          </h1>
          <p>
            {view === "settings"
              ? "Manage spaces, configure workspace access rules, and organize knowledge assets."
              : view === "all-pages"
              ? "Browse all published and draft documentation across all knowledge spaces."
              : view === "search"
              ? "Fast index search across titles, headers, code snippets, and page contents."
              : "Find the decision, guide, or plan that keeps work moving."}
          </p>
        </div>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setName("");
              setFormError("");
              setSpaceOpen(true);
            }}
          >
            <FolderPlus size={16} /> New space
          </Button>
          <Button
            onClick={() => {
              setName("");
              setFormError("");
              setSelectedSpace(spaces.data?.[0]?.id ?? "");
              setPageOpen(true);
            }}
            disabled={!spaces.data?.length}
          >
            <FilePlus2 size={16} /> New page
          </Button>
        </div>
      </header>

      {view !== "settings" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0 6px" }}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "var(--radius-full)",
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  background: active ? "rgba(0, 226, 97, 0.14)" : "var(--surface-2)",
                  color: active ? "var(--accent-primary)" : "var(--text-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {view !== "settings" && (
        <label className="internal-docs-search">
          <Search size={19} />
          <span className="sr-only">Search workspace documents</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and page contents…"
            autoFocus={view === "search"}
          />
          <kbd>⌘ K</kbd>
        </label>
      )}

      {failed ? (
        <section className="internal-docs-error" role="alert">
          <RefreshCw size={22} />
          <div>
            <h2>Knowledge could not be loaded</h2>
            <p>The documentation service is unavailable. Your work is safe; reconnect and try again.</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              spaces.refetch();
              pages.refetch();
              searched.refetch();
            }}
          >
            Retry
          </Button>
        </section>
      ) : view === "settings" ? (
        <div style={{ display: "grid", gap: 24 }}>
          <section className="internal-docs-section">
            <div className="internal-docs-section-title">
              <h2>Spaces Management</h2>
              <span>{spaces.data?.length ?? 0} active spaces</span>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {spaces.data?.map((space) => {
                const spacePages = (allPages.data ?? []).filter((p) => p.space_id === space.id);
                return (
                  <div
                    key={space.id}
                    style={{
                      padding: "16px 20px",
                      borderRadius: "var(--radius-2)",
                      border: "1px solid var(--border-default)",
                      background: "var(--surface-2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{space.name}</h3>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontFamily: "var(--font-mono)",
                            padding: "2px 8px",
                            borderRadius: "var(--radius-full)",
                            background: "rgba(0, 226, 97, 0.12)",
                            border: "1px solid rgba(0, 226, 97, 0.25)",
                            color: "var(--accent-primary)",
                            fontWeight: 600,
                          }}
                        >
                          {space.category || "Platform"}
                        </span>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontFamily: "var(--font-mono)",
                            padding: "2px 8px",
                            borderRadius: "var(--radius-full)",
                            background: "var(--surface-3)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-secondary)",
                            textTransform: "uppercase",
                          }}
                        >
                          {space.visibility}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--text-tertiary)" }}>
                        {space.description || "No description provided."}
                      </p>
                      <small style={{ color: "var(--text-tertiary)", fontSize: 11, display: "block", marginTop: 4 }}>
                        {spacePages.length} {spacePages.length === 1 ? "page" : "pages"} in space
                      </small>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedSpace(space.id);
                          setName("");
                          setFormError("");
                          setPageOpen(true);
                        }}
                      >
                        <FilePlus2 size={14} /> Add page
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="internal-docs-section">
            <div className="internal-docs-section-title">
              <h2>Workspace Policies & Permissions</h2>
              <span>Global rules</span>
            </div>
            <div
              style={{
                padding: "20px",
                borderRadius: "var(--radius-2)",
                border: "1px solid var(--border-default)",
                background: "var(--surface-2)",
              }}
            >
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Canonical Category Structure</h3>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Documents are partitioned into 6 organizational categories: <b>Technical</b>, <b>Marketing</b>, <b>Operations</b>, <b>Platform</b>, <b>Business</b>, and <b>Designs</b>.
                Responsible users and Department Managers have full management access over their department documentation.
              </p>
            </div>
          </section>
        </div>
      ) : view === "all-pages" ? (
        <section className="internal-docs-section">
          <div className="internal-docs-section-title">
            <h2>All Documentation Pages</h2>
            <span>{(allPages.data ?? []).length} total pages</span>
          </div>

          <div style={{ display: "grid", gap: 20 }}>
            {spaces.data?.map((space) => {
              const spacePages = (allPages.data ?? []).filter((p) => p.space_id === space.id);
              return (
                <div key={space.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <BookOpenText size={16} color="var(--accent-primary)" />
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{space.name}</h3>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>({spacePages.length} pages)</span>
                  </div>

                  <div className="internal-docs-recent">
                    {spacePages.map((page) => (
                      <Link href={`/app/docs/spaces/${page.space_id}/${page.id}`} key={page.id}>
                        <span className="doc-file-icon">
                          <BookOpenText size={18} />
                        </span>
                        <div>
                          <h3>{page.title}</h3>
                          <p>{page.excerpt || "Open this page to view technical specifications and sprint tasks."}</p>
                          <small>
                            <Clock3 size={13} /> Updated {new Date(page.updated_at).toLocaleDateString()}
                          </small>
                        </div>
                      </Link>
                    ))}
                    {spacePages.length === 0 && (
                      <div style={{ padding: "14px", fontSize: 12.5, color: "var(--text-tertiary)" }}>
                        No pages in this space yet.{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSpace(space.id);
                            setName("");
                            setPageOpen(true);
                          }}
                          style={{ color: "var(--accent-primary)", border: "none", background: "transparent", cursor: "pointer", fontWeight: 600 }}
                        >
                          Create page
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          <section className="internal-docs-section">
            <div className="internal-docs-section-title">
              <h2>
                {query
                  ? `Results for “${query}”`
                  : view === "recent"
                  ? "Recently opened"
                  : view === "favorites"
                  ? "Saved for later"
                  : selectedCategory === "All"
                  ? "Recently updated"
                  : `${selectedCategory} Documentation`}
              </h2>
              <span>{filtered.length} pages</span>
            </div>

            <div className="internal-docs-recent">
              {filtered.map((page) => (
                <Link href={`/app/docs/spaces/${page.space_id}/${page.id}`} key={page.id}>
                  <span className="doc-file-icon">
                    <BookOpenText size={18} />
                  </span>
                  <div>
                    <h3>{page.title}</h3>
                    <p>{page.excerpt || "Open this page to add context and connect it to the work."}</p>
                    <small>
                      <Clock3 size={13} /> Updated {new Date(page.updated_at).toLocaleDateString()}
                    </small>
                  </div>
                  {view === "favorites" && <Star size={16} aria-label="Favorite" />}
                </Link>
              ))}

              {!pages.isLoading && !searched.isLoading && filtered.length === 0 && (
                <div className="internal-docs-empty">
                  <BookOpenText size={26} />
                  <h3>
                    {query
                      ? `No pages match “${query}”`
                      : view === "favorites"
                      ? "No favorites yet"
                      : view === "recent"
                      ? "No recent pages"
                      : selectedCategory !== "All"
                      ? `No ${selectedCategory} pages yet`
                      : "No pages yet"}
                  </h3>
                  <p>
                    {query
                      ? "Try a broader term or clear the search."
                      : view === "favorites"
                      ? "Favorite a useful page to keep it close."
                      : view === "recent"
                      ? "Pages you open will appear here."
                      : selectedCategory !== "All"
                      ? `Create the first page in a ${selectedCategory} space to start building shared knowledge.`
                      : "Create the first page in a space to start building shared knowledge."}
                  </p>
                  {query ? (
                    <button type="button" onClick={() => setQuery("")}>
                      Clear search
                    </button>
                  ) : view === "all" ? (
                    spaces.data?.length ? (
                      <Button onClick={() => setPageOpen(true)}>Create page</Button>
                    ) : (
                      <Button onClick={() => setSpaceOpen(true)}>Create space</Button>
                    )
                  ) : null}
                </div>
              )}
            </div>
          </section>

          {view === "all" && (
            <section className="internal-docs-section">
              <div className="internal-docs-section-title">
                <h2>Spaces</h2>
                <span>{spaces.data?.length ?? 0} spaces</span>
              </div>
              <div className="internal-space-grid">
                {spaces.data?.map((space, index) => (
                  <article key={space.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span
                        style={{
                          fontSize: 10.5,
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          background: "rgba(0, 226, 97, 0.12)",
                          color: "var(--accent-primary)",
                          fontWeight: 600,
                          border: "1px solid rgba(0, 226, 97, 0.25)",
                        }}
                      >
                        {space.category || "Platform"}
                      </span>
                    </div>
                    <BookOpenText size={20} />
                    <h3>{space.name}</h3>
                    <p>{space.description || "A focused home for durable team knowledge."}</p>
                    <small>{space.visibility}</small>
                    <ArrowRight size={16} />
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Modal
        open={spaceOpen}
        onClose={() => !saving && setSpaceOpen(false)}
        title="Create a documentation space"
      >
        <div className="internal-docs-form">
          <label>
            Space name
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Engineering"
              autoFocus
            />
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as DocCategory)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-3)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            >
              {CATEGORIES.filter((c) => c !== "All").map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsible User (Manages Access)
            <select
              value={responsibleUserId}
              onChange={(event) => setResponsibleUserId(event.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-3)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            >
              <option value="">Current User (Default)</option>
              {usersQuery.data?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <TextArea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Architecture, APIs, deployment, and engineering practices."
            />
          </label>
          {formError && (
            <div role="alert" className="pmp-access-error">
              {formError}
            </div>
          )}
          <div>
            <Button variant="secondary" onClick={() => setSpaceOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={createSpace} disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create space"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={pageOpen}
        onClose={() => !saving && setPageOpen(false)}
        title="Create a documentation page"
      >
        <div className="internal-docs-form">
          <label>
            Page title
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Backend architecture"
              autoFocus
            />
          </label>
          <label>
            Space
            <select value={selectedSpace} onChange={(event) => setSelectedSpace(event.target.value)}>
              {spaces.data?.map((space) => (
                <option value={space.id} key={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
          {formError && (
            <div role="alert" className="pmp-access-error">
              {formError}
            </div>
          )}
          <div>
            <Button variant="secondary" onClick={() => setPageOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={createPage} disabled={saving || !name.trim() || !selectedSpace}>
              {saving ? "Creating…" : "Create page"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function InternalDocsHome() {
  return (
    <Suspense fallback={<div className="internal-docs-home"><p>Loading knowledge…</p></div>}>
      <InternalDocsHomeContent />
    </Suspense>
  );
}
