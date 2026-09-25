import { VentureHome } from "@/components/holding/VentureHome";

export default async function VenturePage({ params }: { params: Promise<{ venture: string }> }) {
  const { venture } = await params;
  return <VentureHome slug={venture} />;
}
