"use client";

import { useEffect, useState } from "react";

/**
 * Recover dynamic route values from the viewer URL when CloudFront serves a
 * statically exported `_` placeholder document.
 */
export function resolveStaticExportParams(
  pathname: string,
  routePrefix: readonly string[],
  parameterCount: number
): string[] | null {
  const viewerSegments = pathname.split("/").filter(Boolean);
  const segments =
    viewerSegments[0] === "app" && viewerSegments[1] === "teams"
      ? viewerSegments.slice(2)
      : viewerSegments;
  if (segments.length !== routePrefix.length + parameterCount) return null;
  if (routePrefix.some((segment, index) => segments[index] !== segment)) return null;

  try {
    return segments.slice(routePrefix.length).map(decodeURIComponent);
  } catch {
    return null;
  }
}

export function useStaticExportParams(
  exportedParams: readonly string[],
  routePrefix: readonly string[]
): string[] {
  const exportedKey = exportedParams.join("/");
  const prefixKey = routePrefix.join("/");
  const [resolved, setResolved] = useState<string[]>(() =>
    exportedParams.map((value) => (value === "_" ? "" : value))
  );

  useEffect(() => {
    if (exportedParams.every((value) => value !== "_")) {
      setResolved([...exportedParams]);
      return;
    }

    const viewerParams = resolveStaticExportParams(
      window.location.pathname,
      routePrefix,
      exportedParams.length
    );
    setResolved(viewerParams ?? exportedParams.map((value) => (value === "_" ? "" : value)));
    // The joined keys make inline parameter arrays safe effect dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportedKey, prefixKey]);

  return resolved;
}
