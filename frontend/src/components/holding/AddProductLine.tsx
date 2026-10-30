"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Link2, Pencil, Plus, Upload, X } from "lucide-react";
import { Alert, Button, Field, Modal, Select, TextArea, TextInput, useToast } from "@/components/ds";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createProduct, updateProduct, uploadProductDocumentation, getProductMembers, type MembershipPersonRead } from "@/lib/api/projects";
import { listUsers } from "@/lib/api/users";
import type { ProductRead } from "@/lib/types";
import { SearchSuggestionInput } from "@/components/docs/SearchSuggestionInput";
import { addDocLink, deleteDocLink, listDocPages, listEntityDocLinks, searchDocPages } from "@/lib/api/docs";
import styles from "./ProductDocumentationUpload.module.css";

export function AddProductLine({ products }: { products: ProductRead[] }) {
  return <ProductLineEditor products={products} />;
}
export function EditProductLine({ product, products }: { product: ProductRead; products: ProductRead[] }) {
  return <ProductLineEditor product={product} products={products} />;
}
function ProductLineEditor({ product, products }: { product?: ProductRead; products: ProductRead[] }) {
  const { t: localizeAttribute } = useI18n();

  const { t: translateUI } = useI18n();

  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const initial = () => ({
    name: product?.name ?? "", description: product?.description ?? "", status: product?.status ?? "Planning",
    priority: product?.priority ?? "P2", environment: product?.environment ?? "Development",
    stack: product?.technology_stack.join(", ") ?? "", repository: product?.repository_url ?? "", documentation: product?.documentation_link ?? "",
  });
  const [form, setForm] = useState(initial);
  const [open, setOpen] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const rosterInitialized = useRef(false);
  const [selectedPeople, setSelectedPeople] = useState<MembershipPersonRead[]>([]);
  const roster = useQuery({ queryKey: ["product-members", product?.id], queryFn: () => getProductMembers(product!.id), enabled: open && !!product });
  const people = useQuery({ queryKey: ["product-people-search", peopleSearch], queryFn: () => listUsers({ search: peopleSearch.trim() || undefined, page_size: 25 }), enabled: open });
  useEffect(() => { if (open && roster.data && !roster.isFetching && !rosterInitialized.current) { setSelectedPeople(roster.data); rosterInitialized.current = true; } }, [open, roster.data, roster.isFetching]);
  const membersReady = !product || (!!roster.data && !roster.isFetching && !roster.isError);
  const [documentationFile, setDocumentationFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [docSearch, setDocSearch] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<{ id: string; title: string }[]>([]);
  const linkedDocs = useQuery({
    queryKey: ["entity-doc-links", "product", product?.id],
    queryFn: () => listEntityDocLinks("product", product!.id),
    enabled: open && !!product,
  });
  const docs = useQuery({
    queryKey: ["product-doc-search", docSearch],
    queryFn: () => docSearch.trim().length >= 2 ? searchDocPages(docSearch.trim()) : listDocPages(),
    enabled: open,
  });
  useEffect(() => {
    if (open && linkedDocs.data) setSelectedDocs(linkedDocs.data.map((link) => ({ id: link.page_id, title: link.title })));
  }, [open, linkedDocs.data]);
  const createdProduct = useRef<ProductRead | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const duplicate = products.some((item) => item.id !== (product?.id ?? createdProduct.current?.id) && item.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  const save = useMutation({
    mutationFn: async () => {
      const details = {
        member_user_ids: selectedPeople.map((person) => person.id),
        name: form.name.trim(), description: form.description.trim(), status: form.status, priority: form.priority,
        environment: form.environment, technology_stack: form.stack.split(",").map((value) => value.trim()).filter(Boolean),
        repository_url: form.repository.trim() || null, documentation_link: form.documentation.trim() || null,
      };
      const current = product ?? createdProduct.current;
      const saved = current ? await updateProduct(current.id, details) : await createProduct({ ...details, owner_user_id: user!.id });
      createdProduct.current = saved;
      if (current || selectedDocs.length > 0) {
        try {
          const existing = await listEntityDocLinks("product", saved.id);
          const selectedIds = new Set(selectedDocs.map((doc) => doc.id));
          const existingIds = new Set(existing.map((link) => link.page_id));
          for (const doc of selectedDocs.filter((doc) => !existingIds.has(doc.id))) {
            await addDocLink(doc.id, { entity_type: "product", entity_id: saved.id });
          }
          for (const link of existing.filter((link) => !selectedIds.has(link.page_id))) {
            await deleteDocLink(link.page_id, link.id);
          }
        } catch (error) {
          queryClient.invalidateQueries({ queryKey: ["products"] });
          throw new Error(`Product line details were saved, but connected documents could not be updated. Retry Save changes. ${error instanceof Error ? error.message : ""}`);
        }
      }
      if (documentationFile) {
        try { await uploadProductDocumentation(saved.id, documentationFile); }
        catch (error) {
          queryClient.invalidateQueries({ queryKey: ["products"] });
          throw new Error(`Product line details were saved, but the document could not be uploaded. Retry to upload it. ${error instanceof Error ? error.message : ""}`);
        }
      }
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["product-members"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-documentation"] });
      queryClient.invalidateQueries({ queryKey: ["doc-pages"] });
      queryClient.invalidateQueries({ queryKey: ["doc-spaces"] });
      queryClient.invalidateQueries({ queryKey: ["entity-doc-links", "product", saved.id] });
      setOpen(false);
      toast.push(product ? "Product line updated." : "Product line added.", "success");
    },
  });
  const allowed = hasPermission(product ? "products.update" : "products.create") || hasPermission("products.manage_all");
  if (!allowed) return null;
  function close() { if (!save.isPending) setOpen(false); }
  function field(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  const action = product ? "Edit product line" : "Add product line";
  return (
    <>
      <Button variant={product ? "tertiary" : "primary"} size={product ? "sm" : "md"} aria-label={product ? `Edit ${product.name}` : action} onClick={() => { rosterInitialized.current = false; setSelectedPeople([]); setPeopleSearch(""); setForm(initial()); setDocSearch(""); setSelectedDocs([]); createdProduct.current = null; setDocumentationFile(null); setFileError(""); save.reset(); setOpen(true); }}>
        {product ? <Pencil size={14} aria-hidden /> : <Plus size={16} aria-hidden />}{product ? <LocalizedText message={"Edit"} /> : action}
      </Button>
      <Modal open={open} onClose={close} title={action} width={600} closeOnBackdrop={!save.isPending}>
        <form onSubmit={(event) => { event.preventDefault(); if (membersReady && form.name.trim() && !duplicate && !fileError && !save.isPending && (!product || (!linkedDocs.isFetching && !linkedDocs.isError))) save.mutate(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}><LocalizedText message={"Product lines group projects. Changes also appear in project dropdowns."} /></p>
          <Field label={translateUI("Product line name")} hint={translateUI("For example, PMP or GMALL.")}><TextInput value={form.name} onChange={(e) => field("name", e.target.value)} maxLength={200} required disabled={save.isPending} /></Field>
          <Field label={translateUI("Description")}><TextArea value={form.description} onChange={(e) => field("description", e.target.value)} disabled={save.isPending} rows={3} /></Field>
          <Field label={translateUI("Product Line members")} hint={translateUI("The owner is always a member. Remove project memberships before removing a person here.")}>
            {roster.isError ? <Button type="button" variant="secondary" onClick={() => roster.refetch()}>{translateUI("Retry loading members")}</Button> : <>
              <SearchSuggestionInput value={peopleSearch} onChange={setPeopleSearch} ariaLabel={translateUI("Search people by name or email")} placeholder={translateUI("Search people by name or email")}
                options={(people.data?.items ?? []).filter((person) => person.is_active && person.id !== (product?.owner_user_id ?? user?.id) && !selectedPeople.some((selected) => selected.id === person.id)).map((person) => ({ id: person.id, label: person.full_name, detail: person.email }))}
                onSelect={(option) => { const person = people.data?.items.find((item) => item.id === option.id); if (person && membersReady && !save.isPending) { setSelectedPeople((current) => [...current, person]); setPeopleSearch(""); } }} />
              {people.isError && <span role="alert">{translateUI("Could not search people. Try again.")}</span>}
              {roster.isFetching && <span role="status">{translateUI("Loading members…")}</span>}
              {selectedPeople.map((person) => <div key={person.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingBlock: 6 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{person.full_name}<small style={{ display: "block", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{person.email}</small></span>
                {person.id === (product?.owner_user_id ?? user?.id) ? <span>{translateUI("Owner")}</span> : <Button type="button" variant="ghost" size="sm" disabled={save.isPending || !membersReady} aria-label={`${translateUI("Remove member")}: ${person.full_name}`} onClick={() => setSelectedPeople((current) => current.filter((item) => item.id !== person.id))}><X size={14} aria-hidden /></Button>}
              </div>)}
            </>}
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <Field label={translateUI("Status")}><Select translateOptions value={form.status} onChange={(e) => field("status", e.target.value)} disabled={save.isPending} options={["Planning", "Active", "Maintenance", "Sunset"].map((value) => ({ value, label: value }))} /></Field>
            <Field label={translateUI("Priority")}><Select translateOptions value={form.priority} onChange={(e) => field("priority", e.target.value)} disabled={save.isPending} options={["P0", "P1", "P2", "P3"].map((value) => ({ value, label: value }))} /></Field>
            <Field label={translateUI("Environment")}><Select translateOptions value={form.environment} onChange={(e) => field("environment", e.target.value)} disabled={save.isPending} options={["Development", "Staging", "Production"].map((value) => ({ value, label: value }))} /></Field>
          </div>
          <Field label={translateUI("Technology stack")} hint={translateUI("Separate technologies with commas.")}><TextInput value={form.stack} onChange={(e) => field("stack", e.target.value)} disabled={save.isPending} placeholder={translateUI("React, Python, PostgreSQL")} /></Field>
          <Field label={translateUI("Repository URL")}><TextInput type="url" value={form.repository} onChange={(e) => field("repository", e.target.value)} disabled={save.isPending} placeholder={translateUI("https://…")} /></Field>
          <div className={styles.field}>
            <span className={styles.label}><LocalizedText message={"Connected documents"} /></span>
            {linkedDocs.isError ? <div role="alert"><Alert kind="warning" title={translateUI("Could not load connected documents")} /><Button type="button" variant="tertiary" size="sm" onClick={() => linkedDocs.refetch()}><LocalizedText message={"Retry"} /></Button></div> : <>
              <SearchSuggestionInput
                value={docSearch}
                options={(docs.data ?? []).filter((doc) => !selectedDocs.some((selected) => selected.id === doc.id)).map((doc) => ({ id: doc.id, label: doc.title, detail: doc.excerpt ?? "Internal Docs" }))}
                placeholder={translateUI("Search documents…")}
                ariaLabel={localizeAttribute("Search documents to connect to product line")}
                onChange={setDocSearch}
                onSelect={(option) => { if (!save.isPending && !linkedDocs.isFetching) { setSelectedDocs((current) => [...current, { id: option.id, title: option.label }]); setDocSearch(""); } }}
              />
              {selectedDocs.map((doc) => <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Link2 size={14} aria-hidden /><span className={styles.title} style={{ flex: 1 }}>{doc.title}</span>
                <Button type="button" variant="ghost" size="sm" disabled={save.isPending || linkedDocs.isFetching} aria-label={`Disconnect document ${doc.title}`} onClick={() => setSelectedDocs((current) => current.filter((item) => item.id !== doc.id))}><X size={14} aria-hidden /></Button>
              </div>)}
              {linkedDocs.isFetching && <span className={styles.hint}><LocalizedText message={"Loading connected documents…"} /></span>}
            </>}
          </div>
          <div className={styles.field}>
            <label htmlFor={`documentation-${product?.id ?? "new"}`} className={styles.label}><LocalizedText message={"Documentation"} /></label>
            <input
              ref={fileInput}
              id={`documentation-${product?.id ?? "new"}`}
              type="file"
              hidden
              accept=".pdf,.doc,.docx,.txt,.md,.markdown,.rtf,.odt"
              disabled={save.isPending}
              aria-describedby={`documentation-hint-${product?.id ?? "new"}`}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                const invalid = file && (file.size === 0 || file.size > 25 * 1024 * 1024 || !/\.(pdf|docx?|txt|md|markdown|rtf|odt)$/i.test(file.name));
                setFileError(invalid ? "Choose a supported, non-empty document up to 25 MB." : "");
                setDocumentationFile(invalid ? null : file);
              }}
            />
            <div className={styles.control} data-selected={!!documentationFile}>
              <span className={styles.icon}>{documentationFile ? <FileText size={20} aria-hidden /> : <Upload size={20} aria-hidden />}</span>
              <div className={styles.details} aria-live="polite">
                <span className={styles.title} title={documentationFile?.name}>{documentationFile?.name ?? (form.documentation ? "Documentation attached" : "Upload a document")}</span>
                <span className={styles.caption}>{documentationFile
                  ? `${documentationFile.size >= 1024 * 1024 ? `${(documentationFile.size / (1024 * 1024)).toFixed(1)} MB` : `${(documentationFile.size / 1024).toFixed(1)} KB`} · Ready to save`
                  : form.documentation ? <LocalizedText message={"Choose a new file to replace it"} /> : <LocalizedText message={"Add a guide, specification, or reference"} />}</span>
              </div>
              <div className={styles.actions}>
                <Button type="button" variant="secondary" size="sm" disabled={save.isPending} onClick={() => fileInput.current?.click()}>
                  <Upload size={15} aria-hidden />{documentationFile || form.documentation ? <LocalizedText message={"Replace file"} /> : <LocalizedText message={"Choose file"} />}
                </Button>
                {(documentationFile || fileError) && <Button type="button" variant="ghost" size="sm" aria-label={translateUI("Clear selected document")} title={translateUI("Clear selection")} disabled={save.isPending} style={{ padding: 8 }} onClick={() => { setDocumentationFile(null); setFileError(""); if (fileInput.current) fileInput.current.value = ""; }}><X size={16} aria-hidden /></Button>}
              </div>
            </div>
            <span id={`documentation-hint-${product?.id ?? "new"}`} className={styles.hint}><LocalizedText message={"PDF, Word, text, Markdown, RTF, or ODT · Max 25 MB. Uploaded when you save."} /></span>
          </div>
          {fileError && <div role="alert"><Alert kind="warning" title={fileError} /></div>}
          {duplicate && <div role="alert"><Alert kind="warning" title={translateUI("A product line with this name already exists.")} /></div>}
          {save.error && <div role="alert"><Alert kind="critical" title={translateUI("Could not save product line")} description={save.error.message} /></div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" disabled={save.isPending} onClick={close}><LocalizedText message={"Cancel"} /></Button>
            <Button type="submit" disabled={!membersReady || !form.name.trim() || duplicate || !!fileError || save.isPending || (!!product && (linkedDocs.isFetching || linkedDocs.isError))}>{save.isPending ? <LocalizedText message={"Saving…"} /> : product ? <LocalizedText message={"Save changes"} /> : <LocalizedText message={"Add product line"} />}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
