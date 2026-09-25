import type { Metadata } from "next";
import { PublicShell } from "@/components/public/PublicShell";
import { Scale, CheckCircle2, AlertCircle, FileCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — Project Management Platform",
  description:
    "Terms of Service for Project Management Platform. Review rights, responsibilities, and service commitments for our workspace platform.",
};

export default function TermsPage() {
  return (
    <PublicShell>
      <div
        style={{
          maxWidth: "840px",
          margin: "0 auto",
          padding: "60px 24px 100px",
          color: "var(--text-primary, #f8fafc)",
          fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
        }}
      >
        <div style={{ marginBottom: "40px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 12px",
              borderRadius: "8px",
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              color: "var(--accent-primary, #6366f1)",
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "16px",
            }}
          >
            <Scale size={14} /> Agreement
          </div>
          <h1
            style={{
              fontSize: "36px",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              margin: "0 0 12px 0",
              background: "linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Terms of Service
          </h1>
          <p
            style={{
              fontSize: "15px",
              color: "var(--text-secondary, #94a3b8)",
              margin: 0,
            }}
          >
            Effective date: September 25, 2026 · Version 2.1
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "32px",
            lineHeight: 1.7,
            fontSize: "15px",
            color: "var(--text-secondary, #cbd5e1)",
          }}
        >
          <section
            style={{
              background: "var(--surface-1, rgba(255, 255, 255, 0.02))",
              border: "1px solid var(--border-default, rgba(255, 255, 255, 0.07))",
              borderRadius: "14px",
              padding: "24px 28px",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#ffffff",
                margin: "0 0 12px 0",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <CheckCircle2 size={18} color="var(--accent-primary, #6366f1)" /> 1. Acceptance of Terms
            </h2>
            <p style={{ margin: 0 }}>
              By accessing or using the Project Management Platform services, you agree to be bound by these Terms of Service and all incorporated policies. If you are entering into this agreement on behalf of an organization or company, you represent that you have authority to bind that entity.
            </p>
          </section>

          <section
            style={{
              background: "var(--surface-1, rgba(255, 255, 255, 0.02))",
              border: "1px solid var(--border-default, rgba(255, 255, 255, 0.07))",
              borderRadius: "14px",
              padding: "24px 28px",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#ffffff",
                margin: "0 0 12px 0",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <FileCheck size={18} color="var(--accent-primary, #6366f1)" /> 2. Workspace Access & Account Safety
            </h2>
            <p style={{ margin: "0 0 12px 0" }}>
              Organizations are responsible for maintaining the confidentiality of their account credentials and configuring role assignments appropriately. You agree to:
            </p>
            <ul style={{ margin: "0 0 0 20px", padding: 0 }}>
              <li>Refrain from reverse-engineering, probing vulnerabilities, or bypassing authorization boundaries.</li>
              <li>Ensure all team member invitations are sent to legitimate authorized recipients.</li>
              <li>Comply with applicable data governance, privacy laws, and export regulations.</li>
            </ul>
          </section>

          <section
            style={{
              background: "var(--surface-1, rgba(255, 255, 255, 0.02))",
              border: "1px solid var(--border-default, rgba(255, 255, 255, 0.07))",
              borderRadius: "14px",
              padding: "24px 28px",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#ffffff",
                margin: "0 0 12px 0",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <AlertCircle size={18} color="var(--accent-primary, #6366f1)" /> 3. Service Level & Support
            </h2>
            <p style={{ margin: 0 }}>
              The platform is provided on high-availability cloud infrastructure with continuous health monitoring and zero-downtime rolling updates. We strive for 99.9% uptime for core collaboration and task tracking services.
            </p>
          </section>
        </div>
      </div>
    </PublicShell>
  );
}
