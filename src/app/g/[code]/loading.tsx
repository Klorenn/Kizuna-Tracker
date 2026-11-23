import { Card } from "@/components/ui/Card";
import { SkeletonBar, SkeletonDisc } from "@/components/ui/Skeleton";

/** Invitación a un grupo: one centred card (icon tile, title, commitment, member count, button). */
export default function Loading() {
  return (
    <>
      <p role="status" className="sr-only">
        Cargando
      </p>
      <main aria-busy="true" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-8">
        <Card className="flex animate-pulse flex-col items-center gap-4 px-6 py-8 motion-reduce:animate-none">
          <SkeletonDisc className="size-16 rounded-md!" />
          <SkeletonBar className="h-7 w-48" />
          <SkeletonBar className="h-4 w-40" />
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="h-12 w-full" />
        </Card>
      </main>
    </>
  );
}
