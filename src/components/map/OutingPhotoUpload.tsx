"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OutingPhotoUpload({ outingId, src }: { outingId: string; src: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(`/api/outings/${outingId}/photo`, { method: "POST", body });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "No pudimos guardar la foto. Inténtalo de nuevo.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {src ? <img src={src} alt="" className="h-16 w-16 rounded-md object-cover" /> : null}
      <label className="inline-flex h-12 cursor-pointer items-center text-body text-ink">
        Agregar foto
        <input type="file" accept="image/jpeg" className="sr-only" onChange={onChange} />
      </label>
      {error ? (
        <p role="alert" className="text-small text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
