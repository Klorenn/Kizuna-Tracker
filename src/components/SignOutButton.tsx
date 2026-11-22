"use client";

import { SignOut } from "@phosphor-icons/react";
import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/Button";
import { cleanupOnSignOut } from "@/lib/push-client";

/** Removes this device's push subscription and runtime caches, then signs out. */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        await cleanupOnSignOut();
        await signOut();
      }}
    >
      <Button type="submit" variant="secondary">
        <SignOut size={20} weight="light" aria-hidden />
        Cerrar sesión
      </Button>
    </form>
  );
}
