import { useSyncExternalStore } from "react";

/** The last tracking error (Spanish copy), shown as a dismissible banner on Hoy. */
let message: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function reportTrackingError(next: string) {
  message = next;
  emit();
}
export function clearTrackingError() {
  message = null;
  emit();
}
export function useTrackingError(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => message,
    () => message,
  );
}
