"use client";

import { Trash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/(app)/perfil/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

/** "Borrar cuenta": the user confirms by typing their @username. */
export function DeleteAccountButton({ username }: { username: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const matches = typed.trim().replace(/^@/, "").toLowerCase() === username.toLowerCase();

  function confirm() {
    setError(null);
    start(async () => {
      const r = await deleteAccount(typed);
      if (!r.ok) return setError(r.error);
      router.replace("/bienvenida");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" className="text-ink hover:bg-field" onClick={() => setOpen(true)}>
        <Trash size={20} weight="light" aria-hidden />
        Borrar cuenta
      </Button>
      <Sheet open={open} title="Borrar cuenta" onClose={() => setOpen(false)}>
        <p className="text-body text-ink">
          Se borran tus fotos y datos, y no podrás volver a entrar. Tus amigos conservan el historial de deudas como
          &quot;Cuenta eliminada&quot;. Tus retos se cancelan; los periodos ya terminados se siguen cobrando.
        </p>
        <Input
          label={`Para confirmar, escribe @${username}`}
          value={typed}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(e) => setTyped(e.target.value)}
          error={error}
        />
        <Button disabled={busy || !matches} onClick={confirm}>
          Borrar mi cuenta
        </Button>
      </Sheet>
    </>
  );
}
