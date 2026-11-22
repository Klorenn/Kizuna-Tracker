"use client";

import { ArrowsClockwise, Clock, X } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useRef, useState } from "react";

function clock(timeZone: string) {
  return new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date());
}

/**
 * Live camera (Figma 06). `getUserMedia` into a <video>, snapshot to a <canvas>.
 * If the camera is unavailable, falls back to the native camera picker.
 */
export function CameraCapture({
  title,
  timeZone,
  onCapture,
  onClose,
}: {
  title: string;
  timeZone: string;
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [mode, setMode] = useState<"starting" | "live" | "fallback">("starting");
  const [time, setTime] = useState(() => clock(timeZone));

  useEffect(() => {
    const id = setInterval(() => setTime(clock(timeZone)), 15_000);
    return () => clearInterval(id);
  }, [timeZone]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMode("fallback");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setMode("live");
      } catch {
        if (!cancelled) setMode("fallback");
      }
    }
    void start();
    return () => {
      cancelled = true;
      // release the camera when leaving or switching
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((b) => b && onCapture(b), "image/jpeg", 0.92);
  }, [onCapture]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink text-on-accent">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 size-full object-cover ${mode === "live" ? "" : "invisible"}`}
        />
        <div className="relative z-10 flex flex-col items-center gap-3 px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <div className="flex w-full items-center">
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="inline-flex size-11 items-center justify-center rounded-full bg-ink/60"
            >
              <X size={20} weight="light" aria-hidden />
            </button>
            <h1 className="flex-1 pr-11 text-center text-body font-medium">{title} · foto en vivo</h1>
          </div>
          <p className="inline-flex items-center gap-2 rounded-full bg-ink/60 px-4 py-2 text-small">
            <Clock size={16} weight="light" aria-hidden />
            Vale la hora del servidor · {time}
          </p>
        </div>
        {mode === "fallback" ? (
          <p className="absolute inset-x-0 top-1/2 px-8 text-center text-body">
            No pudimos abrir la cámara. Usa la cámara de tu teléfono.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-4 bg-ink px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
        <p className="text-small">
          {mode === "fallback" ? "Toma la foto ahora." : "Solo fotos tomadas ahora, sin galería."}
        </p>
        <div className="relative flex w-full items-center justify-center">
          {mode === "fallback" ? (
            <label className="inline-flex h-12 cursor-pointer items-center justify-center rounded-md bg-accent px-5 text-body font-medium text-on-accent">
              Abrir la cámara
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onCapture(f);
                }}
              />
            </label>
          ) : (
            <button
              type="button"
              aria-label="Tomar foto"
              disabled={mode !== "live"}
              onClick={snap}
              className="flex size-[76px] items-center justify-center rounded-full border-[3px] border-on-accent disabled:opacity-50"
            >
              <span className="size-[62px] rounded-full bg-on-accent" />
            </button>
          )}
          {mode === "live" ? (
            <button
              type="button"
              aria-label="Cambiar de cámara"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              className="absolute right-0 inline-flex size-11 items-center justify-center rounded-full bg-on-accent/15"
            >
              <ArrowsClockwise size={20} weight="light" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
