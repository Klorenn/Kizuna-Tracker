import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { addTripStop } from "@/app/(app)/mapa/actions";
import { LoadFailed } from "@/components/LoadFailed";
import { OutingForm } from "@/components/map/OutingForm";
import { TripLink } from "@/components/map/TripLink";
import { ListCard } from "@/components/ui/ListRow";
import { localDate } from "@/domain/dates";
import { monthLabel, monthStartOf } from "@/domain/outings";
import { tripSpan } from "@/domain/trips";
import type { LocalDate } from "@/domain/types";
import type { Rpc } from "@/lib/outings-data";
import { loadMyTrips } from "@/lib/trips-data";
import { createServerClient } from "@/lib/supabase/server";
import { getViewer, viewerMissingDestination } from "@/lib/viewer";

export const metadata: Metadata = { title: "Viaje" };

function dayText(day: LocalDate): string {
  const n = Number(day.slice(8, 10));
  return `${n} de ${monthLabel(day).toLowerCase()}`;
}

function rangeText(startsOn: LocalDate, endsOn: LocalDate): string {
  return startsOn === endsOn ? dayText(startsOn) : `${dayText(startsOn)} – ${dayText(endsOn)}`;
}

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect(await viewerMissingDestination());
  const { id } = await params;
  const supabase = await createServerClient();
  const rpc: Rpc = async (fn, args) => {
    const { data, error } = args ? await supabase.rpc(fn, args as never) : await supabase.rpc(fn);
    return { data, error: error ? { message: error.message } : null };
  };
  const trips = await loadMyTrips(rpc);
  if (!trips.ok) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
        <Link href="/mapa" className="flex h-11 items-center gap-1 text-[17px] text-accent">
          <CaretLeft size={20} weight="light" aria-hidden />
          Mapa
        </Link>
        <LoadFailed href={`/mapa/viajes/${id}`} />
      </main>
    );
  }
  const trip = trips.data.find((item) => item.id === id);
  if (!trip) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
        <Link href="/mapa" className="flex h-11 items-center gap-1 text-[17px] text-accent">
          <CaretLeft size={20} weight="light" aria-hidden />
          Mapa
        </Link>
        <h1 className="text-display font-semibold text-ink">Viaje</h1>
        <p className="text-body text-muted">No encontramos ese viaje.</p>
      </main>
    );
  }
  const today = localDate(new Date(), viewer.timezone);
  const current = monthStartOf(today);
  const allowed = [...new Set([current, ...trip.stops.map((stop) => stop.monthStart)])];
  const span = tripSpan(trip.stops);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <Link href="/mapa" className="flex h-11 items-center gap-1 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Mapa
      </Link>
      <h1 className="text-display font-semibold text-ink">{trip.name}</h1>
      {span ? <p className="text-small text-muted">{rangeText(span.startsOn, span.endsOn)}</p> : null}
      <TripLink tripId={trip.id} link={trip.link} canEdit={trip.isOwner} />
      <ListCard>
        {trip.stops.map((stop) => (
          <div key={stop.id} className="flex flex-col gap-1 border-b border-line px-4 py-3">
            <p className="text-body text-ink">{stop.placeName}</p>
            <p className="text-small text-muted">{rangeText(stop.startsOn, stop.endsOn)}</p>
            <p className="text-small text-ink">{stop.status === "went" ? "Fui" : "Planeado"}</p>
          </div>
        ))}
      </ListCard>
      <OutingForm
        month={current}
        today={today}
        title="Agregar parada"
        allowedMonths={allowed}
        save={(input) => addTripStop({ ...input, tripId: trip.id, allowedMonths: allowed })}
      />
    </main>
  );
}
