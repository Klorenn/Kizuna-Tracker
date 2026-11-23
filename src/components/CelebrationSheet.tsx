"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { CatAnimation } from "@/components/brand/CatAnimation";
import { useCelebrationAutoClose } from "@/components/useCelebrationAutoClose";
import type { CatAsset } from "@/lib/motion/cat-animation";

/**
 * Small celebration sheet with one cat pass. Same behavior as WorkoutDoneSheet: closes after one
 * pass of the cat + 500 ms unless the user interacts; named by its title, described by its body.
 */
export function CelebrationSheet({
  open,
  title,
  asset,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  asset: CatAsset;
  onClose: () => void;
  children: ReactNode;
}) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  const auto = useCelebrationAutoClose(open, onClose, asset);

  return (
    <Sheet open={open} title={title} onClose={onClose} initialFocusRef={doneRef} describedBy={bodyId}>
      <div
        className="flex flex-col gap-4"
        onPointerDown={auto.cancel}
        onTouchStart={auto.cancel}
        onKeyDown={auto.cancel}
      >
        <div className="flex items-center gap-4">
          <CatAnimation asset={asset} width={96} once onPlayStart={auto.start} />
          <div id={bodyId} className="flex min-w-0 flex-1 flex-col gap-1">
            {children}
          </div>
        </div>
        <Button ref={doneRef} onClick={onClose}>
          Listo
        </Button>
      </div>
    </Sheet>
  );
}
