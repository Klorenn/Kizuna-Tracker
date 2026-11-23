"use client";

import { ArrowsClockwise, CaretLeft, Check, Clock, Warning } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { PHOTO_TARGET_MB, type PhotoCheckinResult } from "@/lib/checkins";

/** Review screen (Figma 07). Compresses to JPEG (re-encoding drops EXIF) and posts to the server. */
export function PhotoReview({
  blob,
  field,
  targetId,
  timeZone,
  onRetake,
  onDone,
}: {
  blob: Blob;
  field: "habitId" | "itemId";
  targetId: string;
  timeZone: string;
  onRetake: () => void;
  onDone: (result: Extract<PhotoCheckinResult, { status: 200 }>) => void;
}) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stamp = useMemo(() => {
    const d = new Date();
    const day = new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short", timeZone }).format(d);
    const hour = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(d);
    return `${day.replace(/\./g, "")} · ${hour}`;
  }, [timeZone]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const file = blob instanceof File ? blob : new File([blob], "foto.jpg", { type: "image/jpeg" });
      const { default: imageCompression } = await import("browser-image-compression");
      const small = await imageCompression(file, {
        maxWidthOrHeight: 1600,
        // the server accepts 4 MB (Vercel caps bodies at 4.5 MB): aim well under it
        maxSizeMB: PHOTO_TARGET_MB,
        fileType: "image/jpeg",
        useWebWorker: false,
        initialQuality: 0.85,
      });
      const body = new FormData();
      body.set(field, targetId);
      body.set("file", new File([small], "foto.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/checkins/photo", { method: "POST", body });
      const result = (await res.json()) as PhotoCheckinResult;
      if (result.status !== 200) setError(result.error);
      else onDone(result);
    } catch {
      setError("No pudimos enviar la foto. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-media text-on-media">
      <div className="flex items-center px-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="Volver"
          onClick={onRetake}
          disabled={busy}
          className="inline-flex size-11 items-center justify-center"
        >
          <CaretLeft size={20} weight="light" aria-hidden />
        </button>
        <h1 className="flex-1 pr-11 text-center text-body font-medium">Revisa la foto</h1>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Foto tomada ahora" className="mt-2 min-h-0 w-full flex-1 object-cover" />
      <div className="flex flex-col gap-3 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        <p className="flex items-center gap-2 text-small">
          <Clock size={16} weight="light" aria-hidden />
          {stamp} · sin ubicación
        </p>
        {error ? (
          <p role="alert" className="flex items-center gap-2 text-small">
            <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent text-body font-medium text-on-accent transition-colors duration-[120ms] hover:bg-accent-hover disabled:opacity-60"
        >
          <Check size={20} weight="light" aria-hidden />
          {busy ? "Enviando…" : "Usar esta foto"}
        </button>
        <button
          type="button"
          onClick={onRetake}
          disabled={busy}
          className="inline-flex h-11 items-center justify-center gap-2 text-body font-medium"
        >
          <ArrowsClockwise size={20} weight="light" aria-hidden />
          Tomar otra
        </button>
      </div>
    </div>
  );
}
