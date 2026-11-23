"use client";

import { Button } from "@/components/ui/Button";
import "./globals.css";

/**
 * Last-resort boundary: it replaces the root layout, so it brings its own <html> and <body>.
 * The theme cookie cannot be read here, so it uses data-theme="system" (tokens.css then follows
 * prefers-color-scheme), the same value the root layout renders for the "system" preference.
 * Retry is a full reload: there is no router to refresh once the root layout has failed.
 */
export default function GlobalError() {
  return (
    <html lang="es" data-theme="system">
      <body className="antialiased">
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
          <p className="text-body text-ink">Algo salió mal. Inténtalo de nuevo en unos minutos.</p>
          <Button onClick={() => window.location.reload()}>Reintentar</Button>
        </main>
      </body>
    </html>
  );
}
