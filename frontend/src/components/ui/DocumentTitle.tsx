"use client";

import { useEffect } from "react";

/* Sets the browser-tab title to "<page> · Project Management Platform" for client pages
   (which can't export Next metadata). Rendered by PageHeader with the page's
   own title, so every screen keeps the Platform brand in its tab. */
export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · Project Management Platform` : "Project Management Platform";
    return () => {
      document.title = previous;
    };
  }, [title]);
  return null;
}
