"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { safeAction } from "@/lib/safe-action";
import { requestPasswordReset } from "./actions";

export function ResetForm() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setMessage(null);
    start(async () => {
      const out = await safeAction(() => requestPasswordReset(identifier));
      if (!out.ok) {
        setError(out.error);
        return;
      }
      if (!out.value.ok) setError(out.value.error);
      else setMessage(out.value.message);
    });
  }

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
        autoFocus
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={error}
        invalid={error !== null}
      />
      <Button type="submit" disabled={pending || identifier.trim() === ""}>
        {pending ? "Enviando…" : "Enviar enlace"}
      </Button>
      {message ? <p className="text-body text-ink">{message}</p> : null}
    </form>
  );
}
