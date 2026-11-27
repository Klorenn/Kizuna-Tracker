import { SkeletonBar, SkeletonPage, SkeletonTitle } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage padding="px-5 pb-6 pt-1" gap="gap-4">
      <SkeletonBar className="h-11 w-24" />
      <SkeletonTitle className="w-28" />
      <SkeletonBar className="h-[420px] w-full" />
    </SkeletonPage>
  );
}
