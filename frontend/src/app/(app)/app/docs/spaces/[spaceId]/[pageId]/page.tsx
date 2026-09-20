import DocSpacePageClient from "./DocSpacePageClient";

export function generateStaticParams() {
  return [{ spaceId: "_", pageId: "_" }];
}

export default function DocSpacePage() {
  return <DocSpacePageClient />;
}
