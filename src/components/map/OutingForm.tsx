"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOuting } from "@/app/(app)/mapa/actions";
import { datesInsideMonth, monthEndOf, validateOutingDraft, type PlacePick } from "@/domain/outings";
import type { LocalDate } from "@/domain/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

export function OutingForm({
  month,
  today,
  title = "Agregar salida",
  allowedMonths,
  save,
}: {
  month: LocalDate;
  today: LocalDate;
  title?: string;
  allowedMonths?: LocalDate[];
  save?: (input: {
    place: PlacePick;
    startsOn: string;
    endsOn: string;
    note: string;
    month: LocalDate;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const months = allowedMonths && allowedMonths.length > 0 ? allowedMonths : [month];
  const boundStart = months.reduce((earliest, start) => (start < earliest ? start : earliest));
  const boundEnd = monthEndOf(months.reduce((latest, start) => (start > latest ? start : latest)));
  const initialDay = today >= boundStart && today <= boundEnd ? today : boundStart;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlacePick[]>([]);
  const [place, setPlace] = useState<PlacePick | null>(null);
  const [empty, setEmpty] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState(initialDay);
  const [endsOn, setEndsOn] = useState(initialDay);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setPlaces([]);
      setEmpty(false);
      setSearchError(null);
      return;
    }
    let ignore = false;
    const timer = setTimeout(() => {
      void fetch(`/api/places/search?q=${encodeURIComponent(q)}`)
        .then(async (response) => {
          if (ignore) return;
          if (!response.ok) {
            setPlaces([]);
            setEmpty(false);
            setSearchError("No pudimos buscar lugares. Inténtalo de nuevo.");
            return;
          }
          const body = (await response.json()) as { places?: PlacePick[] };
          const next = Array.isArray(body.places) ? body.places : [];
          setPlaces(next);
          setEmpty(next.length === 0);
          setSearchError(null);
        })
        .catch(() => {
          if (ignore) return;
          setPlaces([]);
          setEmpty(false);
          setSearchError("No pudimos buscar lugares. Inténtalo de nuevo.");
        });
    }, 400);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!place) {
      setError("No encontramos ese lugar.");
      return;
    }
    const fitted = months.find((start) => datesInsideMonth(startsOn, endsOn, start));
    if (!fitted) {
      setError(months.length > 1 ? "Esa fecha no cae en un mes de este viaje." : "Esas fechas no caben en este mes.");
      return;
    }
    const check = validateOutingDraft({ place, startsOn, endsOn, note, month: fitted });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    start(async () => {
      const result = save
        ? await save({ place, startsOn, endsOn, note, month: fitted })
        : await createOuting({ place, startsOn, endsOn, note, month: fitted });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setQuery("");
      setPlaces([]);
      setPlace(null);
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {title}
      </Button>
      <Sheet open={open} title={title} onClose={() => setOpen(false)} tall>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input label="Busca un lugar" name="place" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
          {place ? <p className="text-small text-ink">{place.name}</p> : null}
          {searchError ? (
            <p role="alert" className="text-small text-ink">
              {searchError}
            </p>
          ) : null}
          {empty ? (
            <p className="text-small text-ink">No encontramos ese lugar en Chile. Prueba con el nombre y la comuna.</p>
          ) : null}
          {places.length > 0 ? (
            <ul className="flex flex-col">
              {places.map((hit) => (
                <li key={hit.placeKey}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full flex-col items-start py-2 text-left"
                    onClick={() => {
                      setPlace(hit);
                      setPlaces([]);
                      setQuery(hit.name);
                      setEmpty(false);
                    }}
                  >
                    <span className="text-body text-ink">{hit.name}</span>
                    {hit.detail ? <span className="text-small text-muted">{hit.detail}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Input label="Desde" name="starts" type="date" min={boundStart} max={boundEnd} value={startsOn} onChange={(event) => setStartsOn(event.target.value)} required />
          <Input label="Hasta" name="ends" type="date" min={boundStart} max={boundEnd} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} required />
          <label className="flex flex-col gap-2 text-small text-ink">
            Nota
            <textarea
              name="note"
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-24 rounded-md border border-outline-strong bg-paper px-3 py-2 text-body text-ink"
            />
          </label>
          {error ? (
            <p role="alert" className="text-small text-ink">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
        </form>
      </Sheet>
    </>
  );
}
