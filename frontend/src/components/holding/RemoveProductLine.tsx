"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { Button, useToast } from "@/components/ds";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { ProductRead } from "@/lib/types";

export function RemoveProductLine({ product }: { product: ProductRead }) {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  const archive = useMutation({
    mutationFn: () => apiFetch(`/products/${product.id}/archive`, { method: "POST" }),
    onSuccess: async () => {
      await Promise.all(["products", "projects", "tasks", "admin-archive", "org"].map(key => client.invalidateQueries({ queryKey: [key] })));
      toast.push(t("Product line archived."), "success");
    },
    onError: () => toast.push(t("Could not archive product line."), "error"),
  });
  if (product.status === "Archived" || (!hasPermission("products.update") && !hasPermission("products.manage_all"))) return null;
  return <Button variant="tertiary" size="sm" disabled={archive.isPending} aria-label={t("Archive product line {name}", { name: product.name })} onClick={() => { if (window.confirm(t("Archiving hides this product line and its projects. Only a Super Admin can restore it. Continue?"))) archive.mutate(); }}><Archive size={14} aria-hidden />{t("Archive")}</Button>;
}
