"use client";

import { X } from "@phosphor-icons/react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createScrollLock } from "@/lib/modal-stack";
import { sheetStack as stack } from "@/lib/sheet-stack";

export type ZoomPhoto = { src: string; alt: string };

const PhotoZoomContext = createContext<(photo: ZoomPhoto) => void>(() => {});

const lockScroll = createScrollLock(() => document.body.style);

/** One viewer for the whole app. Avatars and proof photos call `usePhotoZoom`. */
export function PhotoZoomProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<ZoomPhoto | null>(null);
  return (
    <PhotoZoomContext.Provider value={setPhoto}>
      {children}
      <PhotoDialog photo={photo} onClose={() => setPhoto(null)} />
    </PhotoZoomContext.Provider>
  );
}

export function usePhotoZoom(): (photo: ZoomPhoto) => void {
  return useContext(PhotoZoomContext);
}

function PhotoDialog({ photo, onClose }: { photo: ZoomPhoto | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!photo) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const id = stack.open(() => onCloseRef.current());
    const release = lockScroll();
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!stack.isTop(id)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.close(id);
      release();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [photo]);

  if (!photo || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={photo.alt}
        className="relative z-10 flex max-h-[90dvh] w-full max-w-md items-center justify-center outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the same url the thumbnail already loaded */}
        <img src={photo.src} alt="" className="max-h-[85dvh] w-full rounded-md object-contain" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full bg-paper/90 text-ink"
        >
          <X size={20} weight="light" aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** A photo that opens at full size. The image keeps its own classes; the button is the hit target. */
export function ZoomablePhoto({
  src,
  alt,
  className,
  imgClassName,
  loading,
  decoding,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  loading?: "eager" | "lazy";
  decoding?: "async" | "sync" | "auto";
  onError?: () => void;
}) {
  const open = usePhotoZoom();
  return (
    <button
      type="button"
      onClick={() => open({ src, alt })}
      aria-label={`Ver en grande: ${alt}`}
      className={className}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL or a public avatar */}
      <img src={src} alt="" className={imgClassName} loading={loading} decoding={decoding} onError={onError} />
    </button>
  );
}
