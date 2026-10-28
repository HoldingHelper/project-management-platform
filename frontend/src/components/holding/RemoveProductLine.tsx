"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Alert, Button, Modal, useToast } from "@/components/ds";
import { useAuth } from "@/lib/auth/AuthProvider";
import { deleteProduct } from "@/lib/api/projects";
import type { ProductRead } from "@/lib/types";

export function RemoveProductLine({ product }: { product: ProductRead }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteProduct(product.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      toast.push("Product line removed.", "success");
    },
  });
  if (!hasPermission("products.delete") && !hasPermission("products.manage_all")) return null;
  function close() {
    if (remove.isPending) return;
    setOpen(false);
    remove.reset();
  }
  return (
    <>
      <Button variant="tertiary" size="sm" aria-label={`Remove ${product.name}`} onClick={() => setOpen(true)}>
        <Trash2 size={14} aria-hidden />Remove
      </Button>
      <Modal open={open} onClose={close} title="Remove product line" closeOnBackdrop={!remove.isPending}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <p style={{ margin: 0, color: "var(--text-primary)", fontSize: 14 }}>Remove <strong>{product.name}</strong>? This permanently removes the product line from Holding and project dropdowns.</p>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>Product lines with existing projects cannot be removed. Move or remove their projects first.</p>
          {remove.error && <div role="alert"><Alert kind="critical" title="Could not remove product line" description={remove.error instanceof Error ? remove.error.message : "Please try again."} /></div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" disabled={remove.isPending} onClick={close}>Cancel</Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Removing…" : "Remove product line"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
