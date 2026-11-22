"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react";

/** Eye toggle for password fields: 20 px icon, full 44 px touch target flush with the field edge. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
      aria-pressed={shown}
      onClick={onToggle}
      className="-mr-3 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-[120ms] hover:text-ink"
    >
      {shown ? <EyeSlash size={20} weight="light" aria-hidden /> : <Eye size={20} weight="light" aria-hidden />}
    </button>
  );
}
