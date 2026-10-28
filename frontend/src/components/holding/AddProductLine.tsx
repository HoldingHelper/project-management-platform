"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { Alert, Button, Field, Modal, Select, TextArea, TextInput, useToast } from "@/components/ds";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createProduct, updateProduct } from "@/lib/api/projects";
import type { ProductRead } from "@/lib/types";

export function AddProductLine({ products }: { products: ProductRead[] }) {
  return <ProductLineEditor products={products} />;
}
export function EditProductLine({ product, products }: { product: ProductRead; products: ProductRead[] }) {
  return <ProductLineEditor product={product} products={products} />;
}
function ProductLineEditor({ product, products }: { product?: ProductRead; products: ProductRead[] }) {
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
  const duplicate = products.some((item) => item.id !== product?.id && item.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  const save = useMutation({
    mutationFn: () => {
      const details = {
        name: form.name.trim(), description: form.description.trim(), status: form.status, priority: form.priority,
        environment: form.environment, technology_stack: form.stack.split(",").map((value) => value.trim()).filter(Boolean),
        repository_url: form.repository.trim() || null, documentation_link: form.documentation.trim() || null,
      };
      return product ? updateProduct(product.id, details) : createProduct({ ...details, owner_user_id: user!.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
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
      <Button variant={product ? "tertiary" : "primary"} size={product ? "sm" : "md"} aria-label={product ? `Edit ${product.name}` : action} onClick={() => { setForm(initial()); save.reset(); setOpen(true); }}>
        {product ? <Pencil size={14} aria-hidden /> : <Plus size={16} aria-hidden />}{product ? "Edit" : action}
      </Button>
      <Modal open={open} onClose={close} title={action} width={600} closeOnBackdrop={!save.isPending}>
        <form onSubmit={(event) => { event.preventDefault(); if (form.name.trim() && !duplicate && !save.isPending) save.mutate(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>Product lines group projects. Changes also appear in project dropdowns.</p>
          <Field label="Product line name" hint="For example, PMP or GMALL."><TextInput value={form.name} onChange={(e) => field("name", e.target.value)} maxLength={200} required disabled={save.isPending} /></Field>
          <Field label="Description"><TextArea value={form.description} onChange={(e) => field("description", e.target.value)} disabled={save.isPending} rows={3} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <Field label="Status"><Select value={form.status} onChange={(e) => field("status", e.target.value)} disabled={save.isPending} options={["Planning", "Active", "Maintenance", "Sunset"].map((value) => ({ value, label: value }))} /></Field>
            <Field label="Priority"><Select value={form.priority} onChange={(e) => field("priority", e.target.value)} disabled={save.isPending} options={["P0", "P1", "P2", "P3"].map((value) => ({ value, label: value }))} /></Field>
            <Field label="Environment"><Select value={form.environment} onChange={(e) => field("environment", e.target.value)} disabled={save.isPending} options={["Development", "Staging", "Production"].map((value) => ({ value, label: value }))} /></Field>
          </div>
          <Field label="Technology stack" hint="Separate technologies with commas."><TextInput value={form.stack} onChange={(e) => field("stack", e.target.value)} disabled={save.isPending} placeholder="React, Python, PostgreSQL" /></Field>
          <Field label="Repository URL"><TextInput type="url" value={form.repository} onChange={(e) => field("repository", e.target.value)} disabled={save.isPending} placeholder="https://…" /></Field>
          <Field label="Documentation URL"><TextInput type="url" value={form.documentation} onChange={(e) => field("documentation", e.target.value)} disabled={save.isPending} placeholder="https://…" /></Field>
          {duplicate && <div role="alert"><Alert kind="warning" title="A product line with this name already exists." /></div>}
          {save.error && <div role="alert"><Alert kind="critical" title="Could not save product line" description={save.error.message} /></div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" disabled={save.isPending} onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!form.name.trim() || duplicate || save.isPending}>{save.isPending ? "Saving…" : product ? "Save changes" : "Add product line"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
