"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/supabase/public-paths";
import { GoogleLogo } from "@phosphor-icons/react";
import { createBrowserClient } from "@/lib/supabase/client";

const btn =
  "flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line text-[15px] font-medium transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function LoginForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const authFailed = params.get("error") === "auth";
  const [redirecting, setRedirecting] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setError(null);
    setRedirecting(true);
    const { error } = await createBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) {
      setRedirecting(false);
      setError("No pudimos iniciar sesión con Google.");
    }
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error } = await createBrowserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (error) setError("No pudimos enviar el enlace. Revisá el correo.");
    else setMessage(`Te enviamos un enlace a ${email}.`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[32px] font-semibold tracking-[-0.02em]">
          Kizuna Tracker
        </h1>
        <p className="text-[15px] text-muted">
          Rachas de hábitos con retos entre amigos.
        </p>
      </div>

      <button
        type="button"
        onClick={google}
        disabled={redirecting}
        className={`${btn} bg-accent text-surface hover:bg-accent-hover disabled:opacity-60`}
      >
        <GoogleLogo size={20} weight="light" aria-hidden />
        Continuar con Google
      </button>

      <form onSubmit={magicLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-[13px] text-muted">
          O recibí un enlace por correo
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-md border border-outline-strong bg-bg px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={busy}
          className={`${btn} bg-surface hover:bg-accent2 hover:text-surface disabled:opacity-60`}
        >
          Enviar enlace
        </button>
      </form>

      <p role="status" className="min-h-5 text-[13px] text-muted">
        {message}
      </p>
      {authFailed && !error && (
        <p role="alert" className="text-[13px] text-alert">
          No pudimos iniciar sesión. Probá de nuevo.
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-alert">
          {error}
        </p>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
