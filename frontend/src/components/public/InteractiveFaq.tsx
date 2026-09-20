"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle, MessageSquare } from "lucide-react";
import Link from "next/link";

interface FaqItem {
  q: string;
  a: string;
  category: "General" | "Security" | "Architecture" | "AI";
}

const FAQS: FaqItem[] = [
  {
    category: "Architecture",
    q: "How does Project Management Platform connect to our AWS and cloud infrastructure?",
    a: "Project Management Platform is architected for modern decoupled cloud deployments. The backend runs on high-performance FastAPI with PostgreSQL and Redis backplane, while assets and static distributions are served via Amazon S3 and CloudFront CDN for global edge caching.",
  },
  {
    category: "Security",
    q: "Can we invite external team members or contractors with restricted roles?",
    a: "Yes! Admins can generate secure, link-based token invitations with specific roles (e.g., Member, Product Manager, Guest). Invited users register securely and choose their own credentials, with strict RBAC boundary checks on every endpoint.",
  },
  {
    category: "AI",
    q: "How does the AI Project Generator work?",
    a: "The generator uses a LangGraph-powered workflow over modern LLMs to decompose natural language project descriptions into structured two-week sprints, actionable task tickets with acceptance criteria, and suggested tech stacks.",
  },
  {
    category: "Architecture",
    q: "How does realtime synchronization work across team members?",
    a: "The platform uses high-throughput WebSockets connected to a distributed Redis Pub/Sub backplane. Every task status update, comment @mention, and presence ping broadcasts across all replicas in under 15ms.",
  },
  {
    category: "General",
    q: "Can we publish public developer documentation while keeping internal docs private?",
    a: "Absolutely. Knowledge is a first-class module with dual publishing modes. You can draft technical specifications in confidential spaces and publish approved pages to public documentation with a single toggle.",
  },
  {
    category: "Security",
    q: "How are passwords and API tokens protected?",
    a: "Passwords are salted and hashed using Argon2/Bcrypt standards. Session tokens utilize dual JWT rotation (short-lived access tokens with secure refresh token rotation), preventing token reuse and replay attacks.",
  },
];

export function InteractiveFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [filter, setFilter] = useState<string>("All");

  const categories = ["All", "Architecture", "Security", "AI", "General"];

  const filteredFaqs = filter === "All" ? FAQS : FAQS.filter((f) => f.category === filter);

  const toggle = (idx: number) => {
    setOpenIndex((curr) => (curr === idx ? null : idx));
  };

  return (
    <section className="faq-section" aria-labelledby="faq-heading">
      <div className="public-container">
        <div className="public-section-heading text-center">
          <div>
            <span className="public-kicker">Frequently Asked Questions</span>
            <h2 id="faq-heading">Everything you need to know about the platform.</h2>
          </div>
          <p>
            Have additional technical questions? Check our comprehensive documentation or reach out to our engineering team.
          </p>
        </div>

        {/* Category Filter Chips */}
        <div className="faq-category-filters">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`faq-cat-btn ${filter === cat ? "active" : ""}`}
              onClick={() => {
                setFilter(cat);
                setOpenIndex(null);
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FAQ Accordion List */}
        <div className="faq-accordion-list">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div key={faq.q} className={`faq-item ${isOpen ? "open" : ""}`}>
                <button
                  type="button"
                  className="faq-question-btn"
                  onClick={() => toggle(idx)}
                  aria-expanded={isOpen}
                >
                  <span className="faq-q-text">{faq.q}</span>
                  <span className="faq-icon-wrap">
                    <ChevronDown size={18} className={`faq-chevron ${isOpen ? "rotated" : ""}`} />
                  </span>
                </button>

                {isOpen && (
                  <div className="faq-answer-panel animate-slide-down">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* FAQ Help Callout */}
        <div className="faq-bottom-callout">
          <div>
            <HelpCircle size={20} className="callout-icon" />
            <div>
              <b>Looking for developer guides or API references?</b>
              <p>Explore our deep architectural documentation and tutorials.</p>
            </div>
          </div>
          <Link href="/docs" className="public-secondary">
            Read Documentation
          </Link>
        </div>
      </div>
    </section>
  );
}
