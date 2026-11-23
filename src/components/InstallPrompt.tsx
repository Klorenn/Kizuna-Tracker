"use client";

import { Bell, DownloadSimple, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { InstallSteps } from "@/components/InstallSteps";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { enablePush, isIosSafari, isStandalone } from "@/lib/push-client";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Mode = "none" | "ios" | "android" | "notifications";

const DISMISS_KEY = "kizuna.install.dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Install nudge (iOS instructions sheet / Android prompt) and, only inside the installed app,
 * a button that asks for notification permission. Permission is requested from a click only.
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("none");
  const [sheet, setSheet] = useState(false);
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (isStandalone()) {
      const canPush =
        !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        "Notification" in window &&
        "PushManager" in window &&
        Notification.permission === "default";
      setMode(canPush ? "notifications" : "none");
    } else if (!readDismissed() && isIosSafari()) {
      setMode("ios");
    }
  }, []);

  useEffect(() => {
    refresh();
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (isStandalone() || readDismissed()) return;
      setEvent(e as InstallEvent);
      setMode("android");
    };
    const onInstalled = () => {
      setEvent(null);
      refresh();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [refresh]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // storage unavailable: dismissal lasts for this visit only
    }
    setSheet(false);
    setMode("none");
  };

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
    setMode("none");
  }

  async function turnOn() {
    const result = await enablePush();
    if (result === "granted") {
      setMessage("Listo. Te avisaremos de tus recordatorios.");
      setMode("none");
    } else if (result === "denied") {
      setMessage("Los avisos están bloqueados. Actívalos en los ajustes del dispositivo.");
      setMode("none");
    } else {
      setMessage("No pudimos activar los avisos. Inténtalo de nuevo.");
    }
  }

  if (mode === "none" && !message) return null;

  return (
    <>
      <Card className="flex items-center gap-3 p-4">
        {mode === "notifications" ? <Bell size={20} weight="light" aria-hidden className="shrink-0" /> : null}
        {mode === "ios" || mode === "android" ? (
          <DownloadSimple size={20} weight="light" aria-hidden className="shrink-0" />
        ) : null}
        <p className="min-w-0 flex-1 text-body text-ink" role="status">
          {message ??
            (mode === "notifications"
              ? "Activa los recordatorios para no perder tu racha."
              : "Instala Kizuna en tu pantalla de inicio.")}
        </p>
        {mode === "ios" ? (
          <Button className="w-auto!" onClick={() => setSheet(true)}>
            Ver cómo
          </Button>
        ) : null}
        {mode === "android" ? (
          <Button className="w-auto!" onClick={install}>
            Instalar
          </Button>
        ) : null}
        {mode === "ios" || mode === "android" ? (
          <IconButton label="Ahora no" onClick={dismiss}>
            <X size={20} weight="light" aria-hidden />
          </IconButton>
        ) : null}
        {mode === "notifications" ? (
          <Button className="w-auto!" onClick={turnOn}>
            Activar
          </Button>
        ) : null}
      </Card>
      <Sheet open={sheet} title="Instala Kizuna" onClose={() => setSheet(false)}>
        <InstallSteps />
        <Button onClick={() => setSheet(false)}>Entendido</Button>
        <Button variant="ghost" className="text-ink! hover:bg-field!" onClick={dismiss}>
          Ahora no
        </Button>
      </Sheet>
    </>
  );
}
