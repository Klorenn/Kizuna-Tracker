import {
  SkeletonBar,
  SkeletonContentCard,
  SkeletonLabel,
  SkeletonPage,
  SkeletonTitle,
} from "@/components/ui/Skeleton";

/** Grupos: the Retos | Grupos switch, title, the two buttons, then group cards. */
export default function Loading() {
  return (
    <SkeletonPage padding="px-5 pb-6 pt-1">
      <SkeletonBar className="h-13 w-full" />
      <SkeletonTitle className="w-36" />
      <div className="flex gap-2">
        <SkeletonBar className="h-12 flex-1" />
        <SkeletonBar className="h-12 flex-1" />
      </div>
      <SkeletonLabel />
      <SkeletonContentCard progress />
      <SkeletonContentCard progress />
    </SkeletonPage>
  );
}
