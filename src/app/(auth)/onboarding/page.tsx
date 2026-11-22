"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "./actions";

const field =
  "h-11 rounded-md border border-outline-strong bg-bg px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default function OnboardingPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [isAdult, setIsAdult] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await completeOnboarding({
        username,
        displayName,
        timezone,
        isAdult,
        acceptTerms,
      });
      if (res.ok) router.replace("/");
      else setError(res.error);
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-8">
      <h1 className="font-heading text-[32px] font-semibold tracking-[-0.02em]">
        Creá tu perfil
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Usuario
          <input
            className={field}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            autoCapitalize="none"
            autoComplete="username"
            pattern="[a-z0-9_]{3,20}"
            required
          />
          <span>3 a 20 caracteres: letras minúsculas, números o _</span>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Nombre
          <input
            className={field}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Zona horaria
          <input
            className={`${field} font-mono`}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            required
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={isAdult}
            onChange={(e) => setIsAdult(e.target.checked)}
            className="size-5 accent-accent"
          />
          Tengo 18 años o más
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="size-5 accent-accent"
          />
          Acepto los términos de uso
        </label>
        {error && (
          <p role="alert" className="text-[13px] text-alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-md bg-accent text-[15px] font-medium text-surface transition-colors duration-[120ms] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          Continuar
        </button>
      </form>
    </main>
  );
}
