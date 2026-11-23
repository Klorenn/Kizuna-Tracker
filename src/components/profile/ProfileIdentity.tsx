"use client";

import { Camera, Warning } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/Avatar";
import { useAvatarUpload } from "./useAvatarUpload";

/** Perfil header: 88 px avatar with a camera badge (44 px target), name, @usuario and join month. */
export function ProfileIdentity({
  name,
  username,
  src,
  since,
}: {
  name: string;
  username: string;
  src: string | null;
  since: string | null;
}) {
  const { input, pick, busy, error } = useAvatarUpload();
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <Avatar name={name} size="XL" src={src} />
          <button
            type="button"
            onClick={pick}
            disabled={busy}
            aria-label={src ? "Cambiar foto de perfil" : "Agregar foto de perfil"}
            className="group absolute -bottom-[9px] -right-[9px] flex size-11 items-center justify-center rounded-full"
          >
            <span className="flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card ring-2 ring-paper transition-colors duration-[120ms] group-hover:bg-field group-disabled:text-muted">
              <Camera size={16} weight="light" aria-hidden />
            </span>
          </button>
          {input}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="line-clamp-2 break-words text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{name}</h2>
          <p className="truncate font-mono text-[14px] text-muted">@{username}</p>
          {since ? <p className="text-small text-muted">{since}</p> : null}
        </div>
      </div>
      <div aria-live="polite">
        {busy ? <p className="pt-3 text-small text-muted">Subiendo foto…</p> : null}
        {error ? (
          <p role="alert" className="flex items-center gap-1 pt-3 text-small text-ink">
            <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
