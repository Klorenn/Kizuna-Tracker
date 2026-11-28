"use client";

import { useEffect, useState } from "react";
import { cancelOutingFromForm } from "@/app/(app)/mapa/actions";
import { Sheet } from "@/components/ui/Sheet";
import type { CityZone } from "@/domain/map-zone";
import { monthStartOf, upcomingMonthStarts, type PlacePick } from "@/domain/outings";
import type { LocalDate } from "@/domain/types";
import { OutingForm } from "@/components/map/OutingForm";
import { OutingMapLazy } from "@/components/map/OutingMapLazy";
import { OutingPhotoUpload } from "@/components/map/OutingPhotoUpload";

export type MapPinInput = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  visited: boolean;
  address?: string | null;
};

export type PlaceCardData = {
  id: string;
  title: string;
  address: string | null;
  lat: number;
  lng: number;
  when: string;
  photo: string | null;
  owner: boolean;
  canPhoto: boolean;
  memory: boolean;
  placeName: string;
  placeKey?: string;
  placeDetail?: string | null;
  startsOn: LocalDate;
  endsOn: LocalDate;
  note: string | null;
  rememberedOn: string;
  today: LocalDate;
};

export function MapBoard({
  pins,
  zones,
  cards,
}: {
  pins: MapPinInput[];
  zones: CityZone[];
  cards: Record<string, PlaceCardData>;
}) {
  const [id, setId] = useState<string | null>(null);
  return (
    <>
      <div className="h-[420px] overflow-hidden rounded-[15px] border border-line">
        <OutingMapLazy pins={pins} zones={zones} onPick={setId} />
      </div>
      <PlaceSheet card={id ? (cards[id] ?? null) : null} onClose={() => setId(null)} />
    </>
  );
}

function PlaceSheet({ card, onClose }: { card: PlaceCardData | null; onClose: () => void }) {
  const [line, setLine] = useState<string | null>(card?.address ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLine(card?.address ?? null);
    setFailed(false);
    if (!card || card.address) return;
    let ignore = false;
    void fetch(`/api/places/address?lat=${card.lat}&lng=${card.lng}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("address");
        return (await response.json()) as { address?: string | null };
      })
      .then((body) => {
        if (ignore) return;
        const next = typeof body.address === "string" ? body.address.trim() : "";
        setLine(next || null);
        if (!next) setFailed(true);
      })
      .catch(() => {
        if (!ignore) setFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [card]);

  const place = card ? asPlace(card) : null;
  return (
    <Sheet open={card !== null} title={card?.title ?? "Lugar"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-small text-muted">Dirección</p>
          <p className="text-body text-ink">{line ? line : failed ? "No pudimos leer la dirección." : "Buscando la dirección…"}</p>
        </div>
        {card?.when ? <p className="text-small text-muted">{card.when}</p> : null}
        {card?.canPhoto ? <OutingPhotoUpload outingId={card.id} src={card.photo} /> : null}
        {card?.owner ? (
          <div className="flex flex-wrap items-center gap-3">
            <OutingForm
              quiet
              title="Editar"
              month={card.memory ? monthStartOf(card.today) : monthStartOf(card.startsOn)}
              today={card.today}
              memory={card.memory}
              allowedMonths={card.memory ? undefined : planMonths(card.today, card.startsOn)}
              editing={{
                id: card.id,
                place,
                startsOn: card.startsOn,
                endsOn: card.endsOn,
                note: card.note ?? "",
                rememberedOn: card.rememberedOn,
              }}
            />
            <form action={cancelOutingFromForm}>
              <input type="hidden" name="id" value={card.id} />
              <button type="submit" className="inline-flex h-12 items-center text-body text-ink">
                Eliminar
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function asPlace(row: PlaceCardData): PlacePick | null {
  if (!row.placeKey) return null;
  return { name: row.placeName, detail: row.placeDetail ?? null, placeKey: row.placeKey, lat: row.lat, lng: row.lng };
}

function planMonths(today: LocalDate, startsOn: LocalDate): LocalDate[] {
  const months = upcomingMonthStarts(today);
  const start = monthStartOf(startsOn);
  const oldest = `${Number(today.slice(0, 4)) - 30}-01-01`;
  if (start >= oldest && !months.includes(start)) months.push(start);
  return months;
}
