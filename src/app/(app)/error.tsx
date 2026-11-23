"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Error boundary of the signed-in app: a thrown read error (a failed profile or list read) shows
 * here, inside the shell, so the bottom navigation stays. Same copy as the root error page. Retry
 * refreshes the router too: reset() alone re-renders the client tree and would not refetch the
 * Server Components that failed.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <main className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 px-5 py-24 text-center">
      <p className="text-body text-ink">Algo salió mal. Inténtalo de nuevo en unos minutos.</p>
      <Button
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
      >
        Reintentar
      </Button>
    </main>
  );
}
