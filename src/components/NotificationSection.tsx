"use client";

import { BellRinging, DeviceMobile, Warning } from "@phosphor-icons/react";
import { useEffect, useState, useTransition } from "react";
import { InstallSteps } from "@/components/InstallSteps";
import { Button } from "@/components/ui/Button";
import { ListRow, ListSection } from "@/components/ui/ListRow";
import { Sheet } from "@/components/ui/Sheet";
import { enablePush, isIosSafari, isStandalone } from "@/lib/push-client";
import { PUSH_STATUS_COPY, pushStatus, type PushStatus } from "@/lib/push-status";

/** Reads this device's push facts. getRegistration (not `ready`) so it never waits on a missing worker. */
async function readStatus(): Promise<{ status: PushStatus; standalone: boolean }> {
  const standalone = isStandalone();
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let subscribed = false;
  if (hasPush) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      subscribed = !!(await reg?.pushManager?.getSubscription());
    } catch {
      subscribed = false;
    }
  }
  const status = pushStatus({
    hasPush,
    vapid: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    standalone,
    ios: isIosSafari(),
    permission: "Notification" in window ? Notification.permission : null,
    subscribed,
  });
  return { status, standalone };
}

/** Ajustes > Notificaciones: push status on this device, the enable flow and install help. */
export function NotificationSection() {
  const [state, setState] = useState<{ status: PushStatus; standalone: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    let live = true;
    readStatus().then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, []);

  function turnOn() {
    setError(null);
    start(async () => {
      const r = await enablePush();
      if (r === "error") setError("No pudimos activar los avisos. Inténtalo de nuevo.");
      setState(await readStatus());
    });
  }

  const copy = state ? PUSH_STATUS_COPY[state.status] : null;

  const footer = error ? (
    <span role="alert" className="flex items-center gap-1 text-ink">
      <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
      {error}
    </span>
  ) : (
    (copy?.hint ?? "\u00a0")
  );

  return (
    <ListSection id="ajustes-notificaciones" label="Notificaciones" footer={<span aria-live="polite">{footer}</span>}>
      <ListRow
        icon={<BellRinging size={20} weight="light" />}
        label="Avisos en este dispositivo"
        hint={copy ? copy.label : "\u00a0"}
        trailing={
          state?.status === "off" ? (
            <Button className="h-11! w-auto! shrink-0 rounded-full! px-4! text-small!" disabled={busy} onClick={turnOn}>
              {busy ? "Activando…" : "Activar"}
            </Button>
          ) : null
        }
      />
      {state && !state.standalone ? (
        <ListRow
          icon={<DeviceMobile size={20} weight="light" />}
          label="Instalar Kizuna"
          hint="Agrégala a tu pantalla de inicio"
          chevron
          onClick={() => setOpen(true)}
        />
      ) : null}
      <Sheet open={open} title="Instala Kizuna" onClose={() => setOpen(false)}>
        <InstallSteps />
        <p className="text-small text-muted">En Android, abre el menú del navegador y elige Instalar app.</p>
        <Button onClick={() => setOpen(false)}>Entendido</Button>
      </Sheet>
    </ListSection>
  );
}
