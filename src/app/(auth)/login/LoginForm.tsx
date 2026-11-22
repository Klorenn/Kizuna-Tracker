"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn({ identifier, password });
      if (res.ok) {
        router.replace(safeNextPath(next));
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const flagged = error !== null && !profileMissing;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Correo o @usuario"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        className={flagged ? "!border-alert" : ""}
      />
      <Input
        label="Contraseña"
        name="password"
        type={show ? "text" : "password"}
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error}
        className={flagged ? "!border-alert" : ""}
        trailing={
          <button
            type="button"
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShow((v) => !v)}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted"
          >
            {show ? <EyeSlash size={20} weight="light" /> : <Eye size={20} weight="light" />}
          </button>
        }
      />
      <Button type="submit" disabled={pending || identifier.trim() === "" || password === ""}>
        {pending ? "Entrando…" : "Iniciar sesión"}
      </Button>
      <p className="flex min-h-11 items-center justify-center gap-1 text-body">
        <span className="text-muted">¿No tienes cuenta?</span>
        <Link href="/registro" className="font-medium text-accent">
          Crea una
        </Link>
      </p>
    </form>
  );
}
