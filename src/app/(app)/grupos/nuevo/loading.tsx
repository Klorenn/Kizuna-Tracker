import { SkeletonBar, SkeletonLabel, SkeletonPage, SkeletonTitle } from "@/components/ui/Skeleton";

/** Nuevo grupo: back link, title, then the form's fields. */
export default function Loading() {
  return (
    <SkeletonPage padding="px-5 pb-6 pt-1">
      <SkeletonLabel className="w-16" />
      <SkeletonTitle className="w-44" />
      <SkeletonBar className="h-12 w-full" />
      <SkeletonBar className="h-12 w-full" />
      <SkeletonBar className="h-12 w-full" />
      <SkeletonBar className="h-12 w-full" />
      <SkeletonBar className="h-24 w-full" />
      <SkeletonBar className="h-12 w-full" />
    </SkeletonPage>
  );
}
