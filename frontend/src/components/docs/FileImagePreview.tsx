"use client";

import { useEffect, useState } from "react";
import { downloadFile } from "@/lib/api/collaboration";

export function FileImagePreview({ fileId, fileName, maxHeight = 180 }: { fileId: string; fileName: string; maxHeight?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let created: string | undefined;
    downloadFile(fileId).then(blob => {
      if (cancelled) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    }).catch(() => setUrl(null));
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [fileId]);
  if (!url) return null;
  return <img src={url} alt={fileName} style={{ maxWidth: "100%", maxHeight, objectFit: "contain", display: "block" }} />;
}
