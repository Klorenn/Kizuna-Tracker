import { Card } from "@/components/ui/Card";
import { SkeletonBar, SkeletonLabel, SkeletonPage, SkeletonTitle } from "@/components/ui/Skeleton";

/** A stat card: small label above a big number. */
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

/** A chart card: one fixed-height block, like the lazy charts' placeholder. */
function ChartCard() {
  return (
    <Card className="p-4">
      <SkeletonBar className="h-[140px] w-full" />
    </Card>
  );
}

/** Resumen: title, habit switcher, the two streak cards, the calendar, then the weekly and monthly charts. */
export default function Loading() {
  return (
    <SkeletonPage padding="px-5 pb-6 pt-8">
      <SkeletonTitle className="w-44" />
      <div className="flex gap-2">
        <SkeletonBar className="h-11 w-20 rounded-full" />
        <SkeletonBar className="h-11 w-24 rounded-full" />
        <SkeletonBar className="h-11 w-20 rounded-full" />
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
      <ChartCard />
      <SkeletonLabel className="w-20" />
      <ChartCard />
    </SkeletonPage>
  );
}
