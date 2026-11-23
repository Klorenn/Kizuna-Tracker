import {
  SkeletonLabel,
  SkeletonListCard,
  SkeletonPage,
  SkeletonTitle,
} from "@/components/ui/Skeleton";

/** Explorar: back link, title, search field and a list of people. */
export default function Loading() {
  return (
    <SkeletonPage padding="px-5 pb-6 pt-1">
      <SkeletonLabel className="w-16" />
      <SkeletonTitle className="w-40" />
      <div aria-hidden className="h-12 rounded-lg bg-line/40" />
      <SkeletonListCard rows={5} />
    </SkeletonPage>
  );
}
