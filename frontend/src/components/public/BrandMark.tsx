import Link from "next/link";

export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="substance-brand" aria-label="Project Management Platform home">
      <span className="substance-dot-grid" aria-hidden="true">
        <span className="substance-dot bg-emerald" />
        <span className="substance-dot bg-dark" />
        <span className="substance-dot bg-faint" />
        <span className="substance-dot bg-dark" />
        <span className="substance-dot bg-faint" />
        <span className="substance-dot bg-dark" />
        <span className="substance-dot bg-faint" />
        <span className="substance-dot bg-dark" />
        <span className="substance-dot bg-emerald" />
      </span>
      <span className="substance-brand-text font-geist font-semibold text-sm tracking-tight whitespace-nowrap">
        Project<span className="text-emerald-500">Platform</span>
      </span>
    </Link>
  );
}
