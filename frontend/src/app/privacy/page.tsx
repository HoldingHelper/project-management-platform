import type { Metadata } from "next";
import { PublicShell } from "@/components/public/PublicShell";
import { ShieldCheck, Lock, Eye, FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — Project Management Platform",
  description:
    "Privacy Policy for Project Management Platform. Learn how we safeguard your personal information, workspaces, and team data.",
};

export default function PrivacyPage() {
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
            <ShieldCheck size={14} /> Legal & Compliance
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
            Privacy Policy
          </h1>
          <p
            style={{
              fontSize: "15px",
              color: "var(--text-secondary, #94a3b8)",
              margin: 0,
            }}
          >
            Effective date: September 25, 2026 · Version 2.4
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
              <Eye size={18} color="var(--accent-primary, #6366f1)" /> 1. Information We Collect
            </h2>
            <p style={{ margin: "0 0 12px 0" }}>
              We collect information you provide directly to us when creating an account, configuring your organization, or interacting with workspaces. This includes:
            </p>
            <ul style={{ margin: "0 0 0 20px", padding: 0 }}>
              <li><strong>Account Identifiers:</strong> Name, work email address, job title, and team affiliations.</li>
              <li><strong>Operational Data:</strong> Projects, tasks, sprint cycles, task attachments, and documentation pages created by your organization.</li>
              <li><strong>Integration Credentials:</strong> OAuth tokens for GitHub, Google Calendar, and Google Drive, which are encrypted at rest using industry-standard AES/Fernet encryption.</li>
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
              <Lock size={18} color="var(--accent-primary, #6366f1)" /> 2. Security & Data Protection
            </h2>
            <p style={{ margin: "0 0 12px 0" }}>
              We implement strict technical and organizational controls to protect personal and business data against unauthorized access, loss, or alteration:
            </p>
            <ul style={{ margin: "0 0 0 20px", padding: 0 }}>
              <li>All network communication is enforced over TLS 1.3 encryption.</li>
              <li>Authentication is governed by role-based access control (RBAC) with distributed token revocation and brute-force mitigation.</li>
              <li>Uploaded documents and attachments are scanned and served with forced download disposition to prevent inline execution risks.</li>
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
              <FileText size={18} color="var(--accent-primary, #6366f1)" /> 3. Data Retention & Your Rights
            </h2>
            <p style={{ margin: 0 }}>
              You have the right to access, rectify, export, or delete your personal data. Department and organization administrators can manage member profiles directly from the Admin settings console. Upon account deactivation, operational tokens and active sessions are revoked immediately.
            </p>
          </section>
        </div>
      </div>
    </PublicShell>
  );
}
