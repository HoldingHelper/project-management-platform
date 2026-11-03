"use client";

import { useQuery } from "@tanstack/react-query";
import { getDocAttachmentDownloadUrl, listDocAttachments } from "@/lib/api/docs";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { apiFetchBlob } from "@/lib/api/client";
import { FileSharingControl } from "./FileSharingControl";
import { useToast } from "@/components/ds";

export function DocumentAttachments({ pageId }: { pageId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const attachments = useQuery({ queryKey: ["doc-attachments", pageId], queryFn: () => listDocAttachments(pageId) });
  if (!attachments.data?.length) return null;
  return <section style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-subtle)", display: "grid", gap: 8 }} aria-label={t("Attachments")}>
    {attachments.data.map(file => <div key={file.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 12 }}>
      <span>{file.file_name}</span>
      <FileSharingControl docAttachmentId={file.id} fileName={file.file_name} />
      {file.download_share_enabled && <button type="button" onClick={async () => {
        try {
          const { url } = await getDocAttachmentDownloadUrl(file.id);
          if (!file.stored) { window.open(url, "_blank", "noopener,noreferrer"); return; }
          const blob = await apiFetchBlob(`/docs/attachments/${file.id}/download`);
          const href = URL.createObjectURL(blob);
          const anchor = document.createElement("a"); anchor.href = href; anchor.download = file.file_name; anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(href), 1000);
        } catch { toast.push(t("Could not download the file. Please try again."), "error"); }
      }}>{t("Download")}</button>}
    </div>)}
  </section>;
}
