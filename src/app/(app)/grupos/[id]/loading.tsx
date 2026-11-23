import { SkeletonBar, SkeletonContentCard, SkeletonDisc, SkeletonLabel, SkeletonPage } from "@/components/ui/Skeleton";

/** Un grupo: back link, header (icon, name, commitment), the three-way control, then board rows. */
export default function Loading() {
  return (
    <SkeletonPage padding="px-5 pb-6 pt-1">
      <SkeletonLabel className="w-16" />
      <div className="flex items-center gap-3">
        <SkeletonDisc className="size-12 rounded-md!" />
        <SkeletonBar className="h-8 w-44" />
      </div>
      <SkeletonBar className="h-4 w-56" />
      <SkeletonBar className="h-11 w-full" />
      <SkeletonLabel />
      <SkeletonContentCard progress />
      <SkeletonContentCard progress />
      <SkeletonContentCard progress />
    </SkeletonPage>
  );
}
