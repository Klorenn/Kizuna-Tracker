"use client";

import { SignOut } from "@phosphor-icons/react";
import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import { cleanupOnSignOut } from "@/lib/push-client";

/** Removes this device's push subscription and runtime caches, then signs out. */
export function SignOutButton({ variant = "button" }: { variant?: "button" | "row" }) {
  return (
    <form
      action={async () => {
        await cleanupOnSignOut();
        await signOut();
      }}
    >
      {variant === "row" ? (
        <ListRow type="submit" icon={<SignOut size={20} weight="light" />} label="Cerrar sesión" hint="Este dispositivo deja de recibir avisos" />
      ) : (
        <Button type="submit" variant="secondary">
          <SignOut size={20} weight="light" aria-hidden />
          Cerrar sesión
        </Button>
      )}
    </form>
  );
}
