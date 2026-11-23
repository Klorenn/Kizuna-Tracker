import { Card } from "@/components/ui/Card";
import { SkeletonBar, SkeletonPage } from "@/components/ui/Skeleton";

/**
 * Neutral loading shape for sub-pages (forms, editors, drill-downs): a header line and two faint
 * blocks. The list-shaped skeletons of Resumen and the habit page would be the wrong shape there.
 */
export function SimpleLoading() {
  return (
    <SkeletonPage padding="px-5 pb-6 pt-4">
      <div className="flex h-11 items-center">
        <SkeletonBar className="h-4 w-12" />
      </div>
      <SkeletonBar className="h-8 w-48" />
      <Card className="p-4">
        <SkeletonBar className="h-[120px] w-full" />
      </Card>
      <Card className="p-4">
        <SkeletonBar className="h-[120px] w-full" />
      </Card>
    </SkeletonPage>
  );
}

export default SimpleLoading;
