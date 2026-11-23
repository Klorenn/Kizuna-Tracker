"use client";

import imageCompression from "browser-image-compression";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { uploadAvatar } from "@/app/(app)/perfil/actions";

/**
 * Profile photo picker: compressed to 512 px in the browser, re-validated and stripped of EXIF on
 * the server. Render `input` once and call `pick()` from a button.
 */
export function useAvatarUpload() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const small = await imageCompression(file, {
          maxWidthOrHeight: 512,
          maxSizeMB: 0.4,
          fileType: "image/jpeg",
          useWebWorker: true,
        });
        const jpeg = new File([small], "avatar.jpg", { type: "image/jpeg" });
        const r = await uploadAvatar(jpeg);
        if (!r.ok) setError(r.error);
        else router.refresh();
      } catch {
        setError("No pudimos procesar la foto. Inténtalo con otra.");
      }
    });
  }

  const input = <input ref={ref} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={onPick} />;
  return { input, pick: () => ref.current?.click(), busy, error };
}
