"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllRead } from "@/app/(app)/notificaciones/actions";

/** Accent mono-caps action that sits in the section header. */
export function MarkReadButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markAllRead();
          router.refresh();
        })
      }
      className="section-label min-h-6 shrink-0 text-accent disabled:opacity-60"
    >
      Marcar leídas
    </button>
  );
}
