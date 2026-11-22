"use client";

import { LinkSimple, ShareNetwork } from "@phosphor-icons/react";
import { useEffect, useState, useTransition } from "react";
import { createInvite } from "@/app/(app)/amigos/actions";
import { Button } from "./ui/Button";

type Props =
  | { kind: "invite"; label?: string }
  | { kind: "profile"; url: string; label?: string; icon?: "link" | "share" };

/** Web Share API with a copy-to-clipboard fallback; confirms with a short toast. */
export function ShareProfileButton(props: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function share(url: string, title: string) {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast("Link copiado");
    } catch (e) {
      // closing the native share sheet is not an error
      if (e instanceof DOMException && e.name === "AbortError") return;
      setToast("No pudimos copiar el link");
    }
  }

  function onClick() {
    start(async () => {
      if (props.kind === "profile") {
        await share(props.url, "Mi perfil en Kizuna");
        return;
      }
      const r = await createInvite();
      if (!r.ok) setToast(r.error);
      else await share(r.url, "Únete a Kizuna");
    });
  }

  const Icon = props.kind === "profile" && props.icon === "link" ? LinkSimple : ShareNetwork;
  return (
    <>
      <Button variant="secondary" disabled={busy} onClick={onClick}>
        <Icon size={20} weight="light" aria-hidden />
        {props.label ?? (props.kind === "invite" ? "Invitar con un link" : "Compartir perfil")}
      </Button>
      <div aria-live="polite" role="status">
        {toast ? (
          <p className="fixed inset-x-5 bottom-24 z-10 mx-auto max-w-sm rounded-md bg-ink px-4 py-3 text-center text-small text-on-accent shadow-card">
            {toast}
          </p>
        ) : null}
      </div>
    </>
  );
}
