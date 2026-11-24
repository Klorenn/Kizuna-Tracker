"use client";

import { DeviceMobile, Warning } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { createWidgetCode, revokeWidgetDevice } from "@/app/(app)/perfil/actions";
import { Button } from "@/components/ui/Button";
import { widgetPairIntentUrl } from "@/domain/widget-pair-url";
import { WIDGET_DEVICE_CAP, formatPairingCode, isAndroidUserAgent } from "@/domain/widget-code";
import { safeAction } from "@/lib/safe-action";

export type WidgetDeviceView = { id: string; label: string; /** Already formatted by the server ("Conectado hace 4 días · ..."). */ meta: string };

const CAP_COPY = `Ya tienes ${WIDGET_DEVICE_CAP} dispositivos conectados. Desconecta uno para conectar otro.`;
const RETRY = "No pudimos completar la acción. Inténtalo de nuevo.";

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-small text-ink">
      <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
      {children}
    </p>
  );
}

/**
 * Ajustes > Widget de Android. "Conectar widget" makes a one-time code (5 minutes) and, on Android, opens the app's setup
 * screen with an explicit intent; the code is also shown to paste by hand. Each connected device can be disconnected.
 */
export function WidgetSection({ devices }: { devices: WidgetDeviceView[] }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();
  const full = devices.length >= WIDGET_DEVICE_CAP;

  function connect() {
    setError(null);
    setCopied(false);
    start(async () => {
      const call = await safeAction(() => createWidgetCode());
      const r = call.ok ? call.value : call;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCode(r.code);
      if (isAndroidUserAgent(navigator.userAgent)) window.location.href = widgetPairIntentUrl(r.code);
    });
  }

  function disconnect(id: string) {
    setError(null);
    start(async () => {
      const call = await safeAction(() => revokeWidgetDevice(id));
      const r = call.ok ? call.value : call;
      if (!r.ok) setError(RETRY);
    });
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(formatPairingCode(code));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div id="widget" className="scroll-mt-4">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
        <div className="flex min-h-11 items-center gap-3">
          <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-ink">
            <DeviceMobile size={20} weight="light" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-body text-ink">Tus hábitos de hoy en la pantalla de inicio</span>
            <span className="text-small text-muted">Requiere la app de Android versión 1.0.1 o posterior.</span>
          </span>
        </div>
        <Button onClick={connect} disabled={full || busy}>
          Conectar widget
        </Button>
        {full ? <p className="text-small text-muted">{CAP_COPY}</p> : null}
        {error ? <Alert>{error}</Alert> : null}
        {code ? (
          <div className="flex flex-col gap-2 rounded-md bg-field p-3">
            <span aria-label="Código de emparejamiento" className="text-center font-mono text-[28px] font-semibold tracking-[0.12em] text-ink">
              {formatPairingCode(code)}
            </span>
            <span className="text-center text-small text-muted">Vence en 5 minutos y sirve una sola vez.</span>
            <Button variant="secondary" onClick={copy}>
              {copied ? "Código copiado" : "Copiar código"}
            </Button>
            <p className="text-small text-muted">
              Si la app no se abrió sola: agrega el widget de Kizuna a tu pantalla de inicio, tócalo y pega este código.
            </p>
          </div>
        ) : null}
      </div>
      {devices.map((d) => (
        <div key={d.id} className="flex min-h-[52px] items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-body text-ink">{d.label}</span>
            <span className="text-small text-muted">{d.meta}</span>
          </span>
          <Button variant="ghost" className="w-auto" onClick={() => disconnect(d.id)} disabled={busy} aria-label={`Desconectar ${d.label}`}>
            Desconectar
          </Button>
        </div>
      ))}
    </div>
  );
}
