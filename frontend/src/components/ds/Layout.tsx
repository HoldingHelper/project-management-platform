import type { CSSProperties, ElementType, ReactNode } from "react";

type Gap = "xs" | "sm" | "md" | "lg" | "xl";

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pmp-page ${className}`.trim()}>{children}</div>;
}

export function Stack({ children, gap = "md", className = "", as: Component = "div" }: { children: ReactNode; gap?: Gap; className?: string; as?: ElementType }) {
  return <Component className={`pmp-stack pmp-gap-${gap} ${className}`.trim()}>{children}</Component>;
}

export function ResponsiveGrid({ children, min = 260, className = "" }: { children: ReactNode; min?: number; className?: string }) {
  return <div className={`pmp-responsive-grid ${className}`.trim()} style={{ "--pmp-grid-min": `${min}px` } as CSSProperties}>{children}</div>;
}

export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pmp-toolbar ${className}`.trim()}>{children}</div>;
}

export function FilterBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pmp-filter-bar ${className}`.trim()}>{children}</div>;
}

export function SplitPane({ primary, secondary, className = "" }: { primary: ReactNode; secondary: ReactNode; className?: string }) {
  return <div className={`pmp-split-pane ${className}`.trim()}><div>{primary}</div><aside>{secondary}</aside></div>;
}

export function StickyActionBar({ children }: { children: ReactNode }) {
  return <div className="pmp-sticky-actions">{children}</div>;
}

export function Skeleton({ width = "100%", height = 16, radius = "var(--radius-2)" }: { width?: number | string; height?: number; radius?: number | string }) {
  return <span className="pmp-skeleton" aria-hidden style={{ display: "block", width, height, borderRadius: radius }} />;
}
