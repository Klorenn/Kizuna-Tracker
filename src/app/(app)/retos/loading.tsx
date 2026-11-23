import {
  SkeletonContentCard,
  SkeletonDisc,
  SkeletonLabel,
  SkeletonPage,
  SkeletonTitle,
} from "@/components/ui/Skeleton";

/** Retos: the new-challenge button row, title, then challenge cards under a section label. */
export default function Loading() {
  return (
    <SkeletonPage padding="px-5 pb-6 pt-1">
      <div className="flex h-11 items-start justify-end pt-1">
        <SkeletonDisc className="size-10" />
      </div>
      <SkeletonTitle className="w-36" />
      <SkeletonLabel />
      <SkeletonContentCard progress />
      <SkeletonContentCard progress />
      <SkeletonLabel className="w-28" />
      <SkeletonContentCard />
    </SkeletonPage>
  );
}
