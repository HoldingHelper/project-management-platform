import { HoldingCockpit } from "@/components/holding/HoldingCockpit";

export default async function HoldingPage({ params }: { params: Promise<{ holding: string }> }) {
  const { holding } = await params;
  return <HoldingCockpit slug={holding} />;
}
