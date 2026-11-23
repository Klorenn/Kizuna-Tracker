"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { uploadAvatar } from "@/app/(app)/perfil/actions";
import { AVATAR_COMPRESSION } from "./avatar-compression";

/**
 * Profile photo picker: compressed to 256 px in the browser, re-validated and stripped of EXIF on
 * the server. Render `input` once and call `pick()` from a button.
 */
export function useAvatarUpload(onUploaded?: () => void) {
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
        // loaded on demand: the library (~20 kB gz) is only needed when someone actually uploads
        const { default: imageCompression } = await import("browser-image-compression");
        const small = await imageCompression(file, { ...AVATAR_COMPRESSION });
        const jpeg = new File([small], "avatar.jpg", { type: "image/jpeg" });
        const r = await uploadAvatar(jpeg);
        if (!r.ok) setError(r.error);
        else {
          router.refresh();
          onUploaded?.();
        }
      } catch {
        setError("No pudimos procesar la foto. Inténtalo con otra.");
      }
    });
  }

  const input = <input ref={ref} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={onPick} />;
  return { input, pick: () => ref.current?.click(), busy, error };
}
