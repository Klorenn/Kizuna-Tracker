"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";

export type VisitedPlace = {
  title: string;
  address: string | null;
  lat: number;
  lng: number;
};

export function PlaceAddressButton({ place, label }: { place: VisitedPlace; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-left text-body text-ink">
        {label ?? place.title}
      </button>
      <VisitedAddress place={open ? place : null} onClose={() => setOpen(false)} />
    </>
  );
}

export function VisitedAddress({ place, onClose }: { place: VisitedPlace | null; onClose: () => void }) {
  const [line, setLine] = useState<string | null>(place?.address ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLine(place?.address ?? null);
    setFailed(false);
    if (!place || place.address) return;
    let ignore = false;
    const lat = place.lat;
    const lng = place.lng;
    void fetch(`/api/places/address?lat=${lat}&lng=${lng}`)
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
  }, [place]);

  return (
    <Sheet open={place !== null} title={place?.title ?? "Lugar"} onClose={onClose}>
      <p className="text-small text-muted">Dirección</p>
      <p className="text-body text-ink">{line ? line : failed ? "No pudimos leer la dirección." : "Buscando la dirección…"}</p>
    </Sheet>
  );
}
