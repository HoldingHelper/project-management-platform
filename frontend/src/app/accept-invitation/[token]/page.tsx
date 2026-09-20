import { AcceptInvitationClient } from "./AcceptInvitationClient";

export function generateStaticParams() {
  return [{ token: "_" }];
}

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AcceptInvitationClient token={token} />;
}
