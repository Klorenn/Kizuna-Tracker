"use client";

import { useState, useTransition } from "react";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { safeAction } from "@/lib/safe-action";
import { setNewPassword } from "../actions";

export function NewPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    start(async () => {
      const out = await safeAction(() => setNewPassword({ password, confirm }));
      if (!out.ok) setError(out.error);
      else if (!out.value.ok) setError(out.value.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Contraseña nueva"
        name="password"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        invalid={error !== null}
        trailing={<PasswordToggle shown={show} onToggle={() => setShow((v) => !v)} />}
      />
      <Input
        label="Repite la contraseña"
        name="confirm"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={error}
        invalid={error !== null}
      />
      <Button type="submit" disabled={pending || password === "" || confirm === ""}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
