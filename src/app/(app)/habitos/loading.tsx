import { Card } from "@/components/ui/Card";
import { SkeletonBar, SkeletonDisc, SkeletonLabel, SkeletonPage } from "@/components/ui/Skeleton";

function StatCard() {
  return (
    <Card className="flex-1 p-4">
      <div className="flex flex-col gap-3">
        <SkeletonBar className="h-3 w-20" />
        <SkeletonBar className="h-10 w-16" />
      </div>
    </Card>
  );
}

/** A habit's page: back link, identity tile with name, the two streak cards, calendar, then the bars. */
export default function Loading() {
  return (
    <SkeletonPage padding="px-5 pb-6 pt-4">
      <div className="flex h-11 items-center">
        <SkeletonBar className="h-4 w-12" />
      </div>
      <div className="flex items-center gap-3">
        <SkeletonDisc className="size-12 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SkeletonBar className="h-7 w-48" />
          <SkeletonBar className="h-3 w-32" />
        </div>
      </div>
      <div className="flex gap-3">
        <StatCard />
        <StatCard />
      </div>
      <SkeletonLabel />
      <Card className="flex flex-col gap-3 px-1 py-4">
        <SkeletonBar className="mx-3 h-4 w-28" />
        <SkeletonBar className="mx-3 h-[220px]" />
      </Card>
      <SkeletonLabel className="w-32" />
      <Card className="p-4">
        <SkeletonBar className="h-[140px] w-full" />
      </Card>
    </SkeletonPage>
  );
}
