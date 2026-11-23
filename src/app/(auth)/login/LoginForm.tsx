"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { safeNextPath } from "@/lib/supabase/public-paths";
import { signIn } from "./actions";

export function LoginForm({
  next,
  profileMissing,
}: {
  next: string | null;
  profileMissing: boolean;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(
    profileMissing ? "No encontramos tu perfil. Inicia sesión de nuevo o crea una cuenta." : null,
  );
  const [pending, startTransition] = useTransition();
  const passwordRef = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    // Enter on the first field moves on instead of submitting half a form.
    if (identifier.trim() !== "" && password === "") {
      passwordRef.current?.focus();
      return;
    }
    if (identifier.trim() === "" || password === "") return;
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof signIn>>;
      try {
        res = await signIn({ identifier, password });
      } catch {
        setError("No pudimos conectar. Inténtalo de nuevo en unos minutos.");
        return;
      }
      if (res.ok) {
        router.replace(safeNextPath(next));
        router.refresh();
      } else {
        setError(res.error);
        passwordRef.current?.select();
      }
    });
  }

  const flagged = error !== null && !profileMissing;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Correo o @usuario"
        name="identifier"
        type="text"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        autoFocus
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        invalid={flagged}
      />
      <Input
        ref={passwordRef}
        label="Contraseña"
        name="password"
        type={show ? "text" : "password"}
        autoComplete="current-password"
        enterKeyHint="go"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error}
        invalid={flagged}
        trailing={<PasswordToggle shown={show} onToggle={() => setShow((v) => !v)} />}
      />
      <Button
        type="submit"
        className="mt-2"
        aria-disabled={pending || undefined}
        disabled={pending || identifier.trim() === "" || password === ""}
      >
        {pending ? "Entrando…" : "Iniciar sesión"}
      </Button>
      <p className="flex items-center justify-center gap-1 text-body">
        <span className="text-muted">¿No tienes cuenta?</span>
        <Link
          href="/registro"
          className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 font-medium text-accent hover:underline hover:underline-offset-4"
        >
          Crea una
        </Link>
      </p>
    </form>
  );
}
