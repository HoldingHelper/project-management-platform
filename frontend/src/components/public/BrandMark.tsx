"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";
import Link from "next/link";
import { PlatformLogo } from "@/components/brand/PlatformLogo";

export function BrandMark({ href = "/" }: { href?: string }) {
  const { t: translateUI } = useI18n();

  return (
    <Link href={href} className="substance-brand" aria-label={translateUI("Project Management Platform home")}>
      <PlatformLogo size={34} />
      <span className="substance-brand-text">
        <strong><LocalizedText message={"Project Management Platform"} /></strong>
        <small><LocalizedText message={"Tasks · Docs · Projects"} /></small>
      </span>
    </Link>
  );
}
