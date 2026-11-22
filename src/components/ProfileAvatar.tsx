"use client";

import imageCompression from "browser-image-compression";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { uploadAvatar } from "@/app/(app)/perfil/actions";
import { Avatar } from "@/components/ui/Avatar";

/** Avatar with "Cambiar foto": compressed to 512 px in the browser, re-validated and stripped on the server. */
export function ProfileAvatar({ name, username, src }: { name: string; username: string; src: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
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

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} size="L" src={src} />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <p className="truncate text-title font-semibold text-ink">{name}</p>
        <p className="truncate text-small text-muted">@{username}</p>
        <ChangeSlot busy={busy} onClick={() => input.current?.click()} error={error} />
        <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onPick} />
      </div>
    </div>
  );
}

function ChangeSlot({ busy, onClick, error }: { busy: boolean; onClick: () => void; error: string | null }) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-fit text-left text-small font-medium text-accent disabled:text-muted"
      >
        {busy ? "Subiendo…" : "Cambiar foto"}
      </button>
      {error ? (
        <p role="alert" className="text-small text-ink">
          {error}
        </p>
      ) : null}
    </>
  );
}
