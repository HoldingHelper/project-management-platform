"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Alert, Button, Field, Modal, TextInput, useToast } from "@/components/ds";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createProduct } from "@/lib/api/projects";
import type { ProductRead } from "@/lib/types";

export function AddProductLine({ products }: { products: ProductRead[] }) {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const trimmedName = name.trim();
  const duplicate = products.some((product) => product.name.trim().toLowerCase() === trimmedName.toLowerCase());
  const create = useMutation({
    mutationFn: () => createProduct({ name: trimmedName, description: description.trim() || undefined, owner_user_id: user!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setName("");
      setDescription("");
      toast.push("Product line added.", "success");
    },
  });
  if (!hasPermission("products.create") && !hasPermission("products.manage_all")) return null;
  function close() {
    if (create.isPending) return;
    setOpen(false);
    setName("");
    setDescription("");
    create.reset();
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus size={16} aria-hidden />Add product line</Button>
      <Modal open={open} onClose={close} title="Add product line" closeOnBackdrop={!create.isPending}>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (trimmedName && !duplicate && !create.isPending) create.mutate();
        }} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>Create a product line for grouping projects. It will also appear in project dropdowns.</p>
          <Field label="Product line name" hint="For example, PMP or GMALL.">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required disabled={create.isPending} autoComplete="off" />
          </Field>
          <Field label="Description (optional)">
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={create.isPending} rows={3} style={{ width: "100%", padding: 12, borderRadius: "var(--radius-2)", border: "1px solid var(--border-default)", background: "var(--surface-2)", color: "var(--text-primary)", font: "inherit", resize: "vertical" }} />
          </Field>
          {duplicate && <div role="alert"><Alert kind="warning" title="A product line with this name already exists." /></div>}
          {create.error && <div role="alert"><Alert kind="critical" title="Could not add product line" description="Please try again. If your access changed, sign in again." /></div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" disabled={create.isPending} onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!trimmedName || duplicate || create.isPending}>{create.isPending ? "Adding…" : "Add product line"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
