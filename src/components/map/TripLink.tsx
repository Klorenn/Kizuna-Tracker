"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTripLink } from "@/app/(app)/mapa/actions";
import { parseTripLink, tripLinkLabel } from "@/domain/trips";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function TripLink({
  tripId,
  link,
  canEdit,
}: {
  tripId: string;
  link: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(link ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (!link && !canEdit) return null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseTripLink(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    start(async () => {
      const result = await setTripLink(tripId, parsed.link);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-body text-accent">
          {tripLinkLabel(link)}
        </a>
      ) : null}
      {canEdit ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            label="Link"
            name="link"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://drive.google.com/…"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <p className="text-small text-muted">Un link de Drive, o el que uses para este viaje. Si lo dejas vacío, se quita.</p>
          {error ? (
            <p role="alert" className="text-small text-ink">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
        </form>
      ) : null}
    </div>
  );
}
