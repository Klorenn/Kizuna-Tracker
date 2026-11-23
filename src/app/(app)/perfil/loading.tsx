import { Card } from "@/components/ui/Card";
import {
  SkeletonBar,
  SkeletonDisc,
  SkeletonLabel,
  SkeletonPage,
  SkeletonTitle,
} from "@/components/ui/Skeleton";

/** Perfil: title and settings button, identity, the progress card, then habits. */
export default function Loading() {
  return (
    <SkeletonPage padding="px-5 pb-8 pt-8" gap="gap-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <SkeletonTitle className="w-32" />
          <SkeletonDisc className="size-11" />
        </div>
        <div className="flex items-center gap-4">
          <SkeletonDisc className="size-[88px]" />
          <div className="flex flex-col gap-2">
            <SkeletonBar className="h-5 w-40" />
            <SkeletonBar className="h-4 w-24" />
          </div>
        </div>
      </div>
      <Card>
        <div className="grid grid-cols-2 divide-x divide-line">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2 p-4">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between gap-2 p-4">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-4 w-6" />
            </div>
          ))}
        </div>
      </Card>
      <div className="flex flex-col gap-2">
        <SkeletonLabel />
        <Card className="divide-y divide-line">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <SkeletonBar className="h-4 w-28" />
              <SkeletonBar className="ml-auto h-4 w-24" />
            </div>
          ))}
        </Card>
      </div>
    </SkeletonPage>
  );
}
