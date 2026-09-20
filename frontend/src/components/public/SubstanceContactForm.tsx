import { ArrowRight } from "lucide-react";

export function SubstanceContactForm() {
  return (
    <div className="contact-card-panel">
      <h3>Run your own workspace</h3>
      <p>Follow the setup guide to start your self-hosted workspace, then invite your team.</p>
      <a className="substance-submit-btn" href="https://github.com/ali-Eskandarian/project-management-platform#quick-start-with-docker" target="_blank" rel="noreferrer">
        <span>Open setup guide</span><ArrowRight size={15} />
      </a>
    </div>
  );
}
