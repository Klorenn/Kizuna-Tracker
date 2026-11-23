"use client";

import { useCallback, useEffect, useState } from "react";

/** Short confirmation ("Link copiado") that clears itself after 2.5 s. */
export function useToast(): [string | null, (message: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  return [toast, useCallback((message: string) => setToast(message), [])];
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div aria-live="polite" role="status">
      {message ? (
        <p className="fixed inset-x-5 bottom-24 z-10 mx-auto max-w-sm rounded-md bg-ink px-4 py-3 text-center text-small text-on-accent shadow-card">
          {message}
        </p>
      ) : null}
    </div>
  );
}
