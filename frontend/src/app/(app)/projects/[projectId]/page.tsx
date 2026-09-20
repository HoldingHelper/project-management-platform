import ProjectDetailClient from "./ProjectDetailClient";

export function generateStaticParams() {
  return [{ projectId: "_" }];
}

export default function ProjectDetailPage() {
  return <ProjectDetailClient />;
}
