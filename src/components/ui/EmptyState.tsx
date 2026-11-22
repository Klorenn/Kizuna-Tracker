import type { ReactNode } from "react";
import { CatMark } from "@/components/brand/CatMark";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
      <CatMark width={101} />
      <p className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{title}</p>
      <p className="text-body text-muted">{body}</p>
      {action}
    </div>
  );
}
