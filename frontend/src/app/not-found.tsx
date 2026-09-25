import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-deepest, #080c14)",
        color: "var(--text-primary, #f8fafc)",
        padding: "24px",
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          background: "var(--surface-1, rgba(255, 255, 255, 0.03))",
          border: "1px solid var(--border-default, rgba(255, 255, 255, 0.08))",
          borderRadius: "16px",
          padding: "48px 32px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            background: "rgba(99, 102, 241, 0.12)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-primary, #6366f1)",
            marginBottom: "24px",
          }}
        >
          <Compass size={28} />
        </div>
        <h1
          style={{
            fontSize: "48px",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            margin: "0 0 12px 0",
            background: "linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          404
        </h1>
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 600,
            margin: "0 0 12px 0",
            color: "var(--text-primary, #f8fafc)",
          }}
        >
          Page Not Found
        </h2>
        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--text-secondary, #94a3b8)",
            margin: "0 0 32px 0",
          }}
        >
          The page or resource you requested could not be located on this server.
          Please check the URL or return to the workspace.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--accent-primary, #6366f1)",
            color: "#ffffff",
            padding: "10px 20px",
            borderRadius: "10px",
            fontWeight: 600,
            fontSize: "14px",
            textDecoration: "none",
            transition: "opacity 0.15s ease",
          }}
        >
          <ArrowLeft size={16} />
          Back to Overview
        </Link>
      </div>
    </div>
  );
}
