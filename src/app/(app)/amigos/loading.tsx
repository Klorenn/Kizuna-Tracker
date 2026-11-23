import { Card } from "@/components/ui/Card";
import {
  SkeletonContentCard,
  SkeletonLabel,
  SkeletonListCard,
  SkeletonPage,
  SkeletonTitle,
} from "@/components/ui/Skeleton";

/** Amigos: title, search field, invite button, friends list and the first feed cards. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle className="w-44" />
      <div aria-hidden className="h-12 rounded-lg bg-line/40" />
      <Card className="h-12" aria-hidden />
      <SkeletonLabel />
      <SkeletonListCard rows={3} />
      <SkeletonLabel className="w-20" />
      <SkeletonContentCard />
      <SkeletonContentCard />
    </SkeletonPage>
  );
}
