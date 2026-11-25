"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { reportClientError } from "@/lib/client-errors/report";
import { Button } from "@/components/ui/Button";

/**
 * Root error boundary: a thrown server error never shows the framework's default page. Retry
 * refreshes the router too: reset() alone re-renders the client tree and would not refetch the
 * Server Components that failed.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    // a digest means the error was thrown on the server (the message is hidden from the client)
    reportClientError({ kind: error.digest ? "server" : "react", message: error.message, stack: error.stack, digest: error.digest });
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
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
