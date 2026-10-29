import { LocalizedText } from "@/lib/i18n/I18nProvider";
import { ArrowRight } from "lucide-react";

export function SubstanceContactForm() {
  return (
    <div className="contact-card-panel">
      <h3><LocalizedText message={"Run your own workspace"} /></h3>
      <p><LocalizedText message={"Follow the setup guide to start your self-hosted workspace, then invite your team."} /></p>
      <a className="substance-submit-btn" href="https://github.com/ali-Eskandarian/project-management-platform#quick-start-with-docker" target="_blank" rel="noreferrer">
        <span><LocalizedText message={"Open setup guide"} /></span><ArrowRight size={15} />
      </a>
    </div>
  );
}
