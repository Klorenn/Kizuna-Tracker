"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTrip } from "@/app/(app)/mapa/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

export function CreateTrip({ outings }: { outings: { id: string; placeName: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (outings.length < 2) return null;

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await createTrip({ name, outingIds: picked });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/mapa/viajes/${result.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Nuevo viaje
      </Button>
      <Sheet open={open} title="Nuevo viaje" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input label="Nombre" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-small text-ink">Paradas</legend>
            {outings.map((outing) => (
              <label key={outing.id} className="flex min-h-11 items-center gap-3 text-body text-ink">
                <input
                  type="checkbox"
                  checked={picked.includes(outing.id)}
                  onChange={() => toggle(outing.id)}
                />
                {outing.placeName}
              </label>
            ))}
          </fieldset>
          {error ? (
            <p role="alert" className="text-small text-ink">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || picked.length < 2}>
            Guardar
          </Button>
        </form>
      </Sheet>
    </>
  );
}
