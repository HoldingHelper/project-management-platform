import { FunctionHub } from "@/components/holding/FunctionHub";

export default async function FunctionPage({ params }: { params: Promise<{ function: string }> }) {
  const values = await params;
  return <FunctionHub slug={values.function} />;
}
