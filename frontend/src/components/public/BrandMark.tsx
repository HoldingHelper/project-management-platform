import Link from "next/link";
import { PlatformLogo } from "@/components/brand/PlatformLogo";

export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="substance-brand" aria-label="Project Management Platform home">
      <PlatformLogo size={34} />
      <span className="substance-brand-text">
        <strong>Project Management Platform</strong>
        <small>Tasks · Docs · Projects</small>
      </span>
    </Link>
  );
}
