import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { ToastProvider } from "@/components/ds/Toast";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { defaults, type Preferences } from "@/lib/i18n/core";
import { localeInitScript } from "@/lib/i18n/locale-init";

export const metadata: Metadata = {
  title: {
    default: "Project Management Platform",
    template: "%s · Project Management Platform",
  },
  description: "Project Management Platform — Open collaboration platform for projects, knowledge, and execution",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = process.env.NEXT_OUTPUT === "export" ? null : await cookies();
  const initial: Preferences = { ...defaults, locale: jar?.get("pmp.locale")?.value === "fa" ? "fa" : "en", calendar: jar?.get("pmp.calendar")?.value === "persian" ? "persian" : "gregory", numbering_system: jar?.get("pmp.numbering_system")?.value === "arabext" ? "arabext" : "latn" };
  return (
    <html lang={initial.locale} dir={initial.locale === "fa" ? "rtl" : "ltr"} data-theme="light" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: localeInitScript(initial.locale) }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <I18nProvider initial={initial}><QueryProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </QueryProvider></I18nProvider>
      </body>
    </html>
  );
}
