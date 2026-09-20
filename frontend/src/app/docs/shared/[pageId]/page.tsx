import PublicSharedDocClient from "./PublicSharedDocClient";

export function generateStaticParams() {
  return [{ pageId: "_" }];
}

export default function PublicSharedDocPage() {
  return <PublicSharedDocClient />;
}
