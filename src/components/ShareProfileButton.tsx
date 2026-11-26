"use client";

import { LinkSimple, ShareNetwork } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { createInvite } from "@/app/(app)/amigos/actions";
import { ListRow } from "./ui/ListRow";
import { Toast, useToast } from "./ui/Toast";
import { Button } from "./ui/Button";

type Props =
  | { kind: "invite"; label?: string }
  | { kind: "profile"; url: string; label?: string; icon?: "link" | "share"; variant?: "button" | "row" };

/** Web Share API with a copy-to-clipboard fallback; confirms with a short toast. */
export function ShareProfileButton(props: Props) {
  const [toast, showToast] = useToast();
  const [busy, start] = useTransition();
  const [fallback, setFallback] = useState<string | null>(null);

  async function share(url: string, title: string) {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        setFallback(null);
        return;
      }
      await navigator.clipboard.writeText(url);
      setFallback(null);
      showToast("Link copiado");
    } catch (e) {
      // closing the native share sheet is not an error
      if (e instanceof DOMException && e.name === "AbortError") return;
      setFallback(url);
      showToast("No pudimos copiar el link. Selecciónalo y cópialo a mano.");
    }
  }

  function onClick() {
    start(async () => {
      if (props.kind === "profile") {
        await share(props.url, "Mi perfil en Kizuna");
        return;
      }
      const r = await createInvite();
      if (!r.ok) showToast(r.error);
      else await share(r.url, "Únete a Kizuna");
    });
  }

  const Icon = props.kind === "profile" && props.icon === "link" ? LinkSimple : ShareNetwork;
  const label = props.label ?? (props.kind === "invite" ? "Invitar con un link" : "Compartir perfil");
  return (
    <div className="flex w-full flex-col">
      {props.kind === "profile" && props.variant === "row" ? (
        <ListRow
          icon={<Icon size={20} weight="light" />}
          label={label}
          hint="Envía tu link o cópialo"
          onClick={onClick}
          disabled={busy}
        />
      ) : (
        <Button variant="secondary" disabled={busy} onClick={onClick}>
          <Icon size={20} weight="light" aria-hidden />
          {label}
        </Button>
      )}
      {fallback ? (
        <input
          readOnly
          value={fallback}
          aria-label="Enlace para copiar"
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 h-12 w-full rounded-md border border-outline-strong bg-paper px-3 font-mono text-small text-ink"
        />
      ) : null}
      <Toast message={toast} />
    </div>
  );
}
