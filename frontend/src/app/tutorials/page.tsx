import type { Metadata } from "next";
import { PublicContentPage } from "@/components/public/PublicContentPage";
import { TutorialLibrary } from "@/components/public/TutorialLibrary";
export const metadata:Metadata={title:"Tutorials",description:"Video tutorials connected to detailed Project Management Platform documentation."};
export default function TutorialsPage(){return <PublicContentPage eyebrow="Tutorials" title="See the workflow, then keep the written guide." intro="Focused walkthroughs for common jobs. Every video links to documentation you can scan, search, and share."><section className="public-section public-container"><TutorialLibrary/></section></PublicContentPage>}
