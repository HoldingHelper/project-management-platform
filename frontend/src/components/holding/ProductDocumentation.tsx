"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { Button, useToast } from "@/components/ds";
import { downloadProductDocumentation, getProductDocumentation } from "@/lib/api/projects";
import type { ProductRead } from "@/lib/types";

export function ProductDocumentation({ product }: { product: ProductRead }) {
  const uploaded = product.documentation_link?.startsWith("attachment:");
  const document = useQuery({ queryKey: ["product-documentation", product.id, product.documentation_link], queryFn: () => getProductDocumentation(product.id), enabled: !!uploaded });
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();
  if (!uploaded) return product.documentation_link && /^https?:\/\//i.test(product.documentation_link)
    ? <a href={product.documentation_link} target="_blank" rel="noreferrer">Documentation</a> : null;
  async function download() {
    setDownloading(true);
    try {
      const metadata = document.data ?? await getProductDocumentation(product.id);
      const blob = await downloadProductDocumentation(product.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = metadata.file_name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not download documentation.", "error");
    } finally { setDownloading(false); }
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12, color: "var(--text-secondary)" }}>
      <FileText size={15} aria-hidden /><span>{document.data?.file_name ?? "Documentation"}</span>
      <Button variant="tertiary" size="sm" disabled={downloading} onClick={download}><Download size={14} aria-hidden />{downloading ? "Downloading…" : "Download"}</Button>
    </div>
  );
}
