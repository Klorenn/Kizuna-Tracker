"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOuting, logVisit, updateOuting, updateVisit } from "@/app/(app)/mapa/actions";
import { cleanVisitDay, datesInsideMonth, monthEndOf, validateOutingDraft, type PlacePick } from "@/domain/outings";
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
  company,
  memory = false,
  quiet = false,
  editing,
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
  company?: { friends: { id: string; name: string }[] };
  memory?: boolean;
  quiet?: boolean;
  editing?: {
    id: string;
    place: PlacePick | null;
    startsOn: string;
    endsOn: string;
    note: string;
    rememberedOn?: string;
  };
}) {
  const router = useRouter();
  const months = allowedMonths && allowedMonths.length > 0 ? allowedMonths : [month];
  const boundStart = months.reduce((earliest, start) => (start < earliest ? start : earliest));
  const boundEnd = monthEndOf(months.reduce((latest, start) => (start > latest ? start : latest)));
  const initialDay = today >= boundStart && today <= boundEnd ? today : boundStart;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(editing?.place?.name ?? "");
  const [places, setPlaces] = useState<PlacePick[]>([]);
  const [place, setPlace] = useState<PlacePick | null>(editing?.place ?? null);
  const [empty, setEmpty] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState(editing?.startsOn || initialDay);
  const [endsOn, setEndsOn] = useState(editing?.endsOn || initialDay);
  const [note, setNote] = useState(editing?.note ?? "");
  const [friendId, setFriendId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [rememberedOn, setRememberedOn] = useState(editing?.rememberedOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setPlaces([]);
      setEmpty(false);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let ignore = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void fetch(`/api/places/search?q=${encodeURIComponent(q)}`)
        .then(async (response) => {
          if (ignore) return;
          setSearching(false);
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
          setSearching(false);
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
    if (memory) {
      const day = cleanVisitDay(rememberedOn, today);
      if (!day.ok) {
        setError(day.error);
        return;
      }
      setError(null);
      start(async () => {
        const result = editing
          ? await updateVisit({ id: editing.id, place, on: rememberedOn, today })
          : await logVisit({ place, on: rememberedOn, today });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        setQuery("");
        setPlaces([]);
        setPlace(null);
        setRememberedOn("");
        router.refresh();
      });
      return;
    }
    const fitted = months.find((start) => datesInsideMonth(startsOn, endsOn, start));
    if (!fitted) {
      setError(
        save
          ? months.length > 1
            ? "Esa fecha no cae en un mes de este viaje."
            : "Esas fechas no caben en este mes."
          : "Esas fechas tienen que caer en los próximos 12 meses.",
      );
      return;
    }
    if (!save && friendId && guestName.trim()) {
      setError("Elige un amigo o escribe un nombre, no los dos.");
      return;
    }
    const check = validateOutingDraft({ place, startsOn, endsOn, note, month: fitted });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    start(async () => {
      const result = editing
        ? await updateOuting({ id: editing.id, place, startsOn, endsOn, note, month: fitted })
        : save
        ? await save({ place, startsOn, endsOn, note, month: fitted })
        : await createOuting({
            place,
            startsOn,
            endsOn,
            note,
            month: fitted,
            guestName,
            friendId: friendId || null,
          });
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
      {quiet ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-12 items-center text-body text-ink">
          {title}
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          {title}
        </Button>
      )}
      <Sheet open={open} title={title} onClose={() => setOpen(false)} tall>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input label="Busca un lugar" name="place" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
          {place ? <p className="text-small text-ink">{place.name}</p> : null}
          {searchError ? (
            <p role="alert" className="text-small text-ink">
              {searchError}
            </p>
          ) : null}
          {searching ? <p className="text-small text-muted">Buscando opciones…</p> : null}
          {empty ? (
            <p className="text-small text-ink">No encontramos ese lugar en Chile. Prueba con el nombre y la comuna.</p>
          ) : null}
          {places.length > 0 ? (
            <ul aria-label="Opciones" className="flex flex-col overflow-hidden rounded-md border border-line">
              {places.map((hit) => (
                <li key={hit.placeKey} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left"
                    onClick={() => {
                      setPlace(hit);
                      setPlaces([]);
                      setSearching(false);
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
          {memory ? (
            <Input
              label="Si te acuerdas, ¿cuándo?"
              name="when"
              type="date"
              min={`${Number(today.slice(0, 4)) - 30}-01-01`}
              max={today}
              value={rememberedOn}
              onChange={(event) => setRememberedOn(event.target.value)}
            />
          ) : null}
          {!memory && company ? (
            <>
              <label className="flex flex-col gap-2 text-small text-ink">
                Con un amigo
                <select
                  name="friend"
                  value={friendId}
                  onChange={(event) => setFriendId(event.target.value)}
                  className="h-12 rounded-md border border-outline-strong bg-paper px-3 text-body text-ink"
                >
                  <option value="">Sin amigo de la app</option>
                  {company.friends.map((friend) => (
                    <option key={friend.id} value={friend.id}>
                      {friend.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="O un nombre, si no tiene la app"
                name="guest"
                value={guestName}
                maxLength={40}
                placeholder="Mamá"
                onChange={(event) => setGuestName(event.target.value)}
              />
            </>
          ) : null}
          {memory ? null : <Input label="Desde" name="starts" type="date" min={boundStart} max={boundEnd} value={startsOn} onChange={(event) => setStartsOn(event.target.value)} required />}
          {memory ? null : <Input label="Hasta" name="ends" type="date" min={boundStart} max={boundEnd} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} required />}
          {memory ? null : <label className="flex flex-col gap-2 text-small text-ink">
            Nota
            <textarea
              name="note"
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-24 rounded-md border border-outline-strong bg-paper px-3 py-2 text-body text-ink"
            />
          </label>}
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
