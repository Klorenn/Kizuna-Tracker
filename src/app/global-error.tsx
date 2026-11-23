"use client";

import { Button } from "@/components/ui/Button";
import "./globals.css";

/**
 * Last-resort boundary: it replaces the root layout, so it brings its own <html> and <body>.
 * Same copy and tokens as the root error page; the theme follows the system (no cookie access here).
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body className="antialiased">
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
          <p className="text-body text-ink">Algo salió mal. Inténtalo de nuevo en unos minutos.</p>
          <Button onClick={reset}>Reintentar</Button>
        </main>
      </body>
    </html>
  );
}
