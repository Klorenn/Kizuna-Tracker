import type { ComponentProps } from "react";
import { Card } from "@/components/ui/Card";

/*
 * Loading placeholders for route `loading.tsx` files. They are deliberately faint: the `line`
 * token (a hairline grey) at reduced opacity on the page background, the same radius and spacing
 * as the real cards, and a very slow pulse that is switched off under prefers-reduced-motion.
 * Nothing dark and nothing that reads as a broken image. Server components, no client JS.
 */

/** One faint bar or block. Size it with Tailwind classes (`h-4 w-24`). */
export function SkeletonBar({ className = "", ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={`rounded-md bg-line/60 ${className}`} {...props} />;
}

/** A faint disc, like an avatar (`size-10`). */
export function SkeletonDisc({ className = "", ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={`shrink-0 rounded-full bg-line/60 ${className}`} {...props} />;
}

/** The mono-caps section label row (24 px high). */
export function SkeletonLabel({ className = "w-24" }: { className?: string }) {
  return (
    <div className="flex h-6 items-center">
      <SkeletonBar className={`h-3 ${className}`} />
    </div>
  );
}

/** A list row: avatar disc plus a title line and a hint line. */
export function SkeletonPersonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <SkeletonDisc className="size-10" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <SkeletonBar className="h-4 w-32" />
        <SkeletonBar className="h-3 w-20" />
      </div>
    </div>
  );
}

/** A card of rows separated by hairlines, like the friends list. */
export function SkeletonListCard({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonPersonRow key={i} />
      ))}
    </Card>
  );
}

/** A content card: two text lines and an optional progress bar. */
export function SkeletonContentCard({ progress = false }: { progress?: boolean }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SkeletonBar className="h-4 w-40" />
          <SkeletonBar className="h-3 w-28" />
        </div>
        <SkeletonBar className="h-4 w-12" />
      </div>
      {progress ? <SkeletonBar className="h-[6px] w-full rounded-full" /> : null}
    </Card>
  );
}

/**
 * Page frame for a loading file: same `main` container and gap as the real screens, announced
 * as busy, with one slow pulse over the whole group (off for reduced motion).
 */
export function SkeletonPage({
  padding = "px-5 pb-6 pt-8",
  gap = "gap-4",
  children,
}: {
  padding?: string;
  gap?: string;
  children: React.ReactNode;
}) {
  return (
    <main aria-busy="true" className={`mx-auto max-w-md ${padding}`}>
      <p role="status" className="sr-only">
        Cargando
      </p>
      <div className={`flex flex-col ${gap} animate-pulse motion-reduce:animate-none`}>{children}</div>
    </main>
  );
}

/** The 44 px display title of a tab. */
export function SkeletonTitle({ className = "w-40" }: { className?: string }) {
  return <SkeletonBar className={`h-10 ${className}`} />;
}
