import {
  SkeletonContentCard,
  SkeletonLabel,
  SkeletonListCard,
  SkeletonPage,
  SkeletonTitle,
} from "@/components/ui/Skeleton";

/** Shown at once on any tab tap while the page's data loads. Routes with their own loading file override it. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle />
      <SkeletonLabel />
      <SkeletonContentCard progress />
      <SkeletonContentCard />
      <SkeletonListCard rows={2} />
    </SkeletonPage>
  );
}
