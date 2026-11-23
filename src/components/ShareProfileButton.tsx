"use client";

import { LinkSimple, ShareNetwork } from "@phosphor-icons/react";
import { useTransition } from "react";
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

  async function share(url: string, title: string) {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast("Link copiado");
    } catch (e) {
      // closing the native share sheet is not an error
      if (e instanceof DOMException && e.name === "AbortError") return;
      showToast("No pudimos copiar el link");
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
    <>
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
      <Toast message={toast} />
    </>
  );
}
