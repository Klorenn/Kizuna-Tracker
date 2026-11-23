"use client";

import { Button } from "@/components/ui/Button";

/** Root error boundary: a thrown server error never shows the framework's default page. */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="text-body text-ink">Algo salió mal. Inténtalo de nuevo en unos minutos.</p>
      <Button onClick={reset}>Reintentar</Button>
    </main>
  );
}
