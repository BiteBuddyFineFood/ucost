import ReviewPage from "@/components/review-page";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <ReviewPage token={(await params).token} />;
}
