"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/I18nProvider";

type Permission = { enabled: boolean; can_manage: boolean };
export function FileSharingControl({ fileId, docAttachmentId, fileName }: { fileId?: string; docAttachmentId?: string; fileName: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const resource = docAttachmentId ? `/docs/attachments/${docAttachmentId}/sharing` : `/files/${fileId}/sharing`;
  const permission = useQuery({ queryKey: ["file-sharing", resource], queryFn: () => apiFetch<Permission>(resource), staleTime: 0, refetchOnWindowFocus: true });
  const update = useMutation({
    mutationFn: (enabled: boolean) => apiFetch<Permission>(resource, { method: "PUT", body: { enabled } }),
    onSuccess: async (data) => {
      client.setQueryData(["file-sharing", resource], data);
      await Promise.all(["entity-files", "doc-attachments", "product-documentation"].map(key => client.invalidateQueries({ queryKey: [key] })));
    },
  });
  if (!permission.data) return permission.isError ? <span role="alert">{t("Could not load download permission.")}</span> : null;
  return <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, maxWidth: "100%" }}>
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", cursor: permission.data.can_manage ? "pointer" : "default" }}>
      <input type="checkbox" aria-label={t("Allow download and Telegram sharing for {name}", { name: fileName })} checked={permission.data.enabled} disabled={!permission.data.can_manage || update.isPending} onChange={event => update.mutate(event.target.checked)} />
      {t("Allow download and Telegram sharing")}
    </label>
    {update.isError && <span role="alert" style={{ fontSize: 12, color: "var(--status-blocked)" }}>{t("Could not update download permission.")}</span>}
  </span>;
}
