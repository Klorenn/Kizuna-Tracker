import { CaretLeft, Check } from "@phosphor-icons/react/dist/ssr";
import { CatAnimation } from "@/components/brand/CatAnimation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoadFailed } from "@/components/LoadFailed";
import { InviteCompanion } from "@/components/map/InviteCompanion";
import { MapBoard, type PlaceCardData } from "@/components/map/MapBoard";
import { OutingForm } from "@/components/map/OutingForm";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListCard } from "@/components/ui/ListRow";
import { localDate } from "@/domain/dates";
import { mapMarks } from "@/domain/map-marks";
import { canMarkWent, mapScreen, monthIndexLabel, monthLabel, planLine, upcomingMonthStarts, visitCounts, visitLabel } from "@/domain/outings";
import type { LocalDate } from "@/domain/types";
import { CreateTrip } from "@/components/map/CreateTrip";
import { RepeatOuting } from "@/components/map/RepeatOuting";
import { bondStat, distinctPlaces } from "@/domain/outing-memory";
import { markOutingWentFromForm, respondInviteFromForm } from "@/app/(app)/mapa/actions";
import { loadMyMap, loadMyMonth, loadMyOutingInvite, type MapPinView, type OutingInviteView, type Rpc, type UpcomingPlan } from "@/lib/outings-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { cityZones } from "@/lib/places";
import { loadMyMonthIndex, loadMyTrips } from "@/lib/trips-data";
import { getViewer, viewerMissingDestination } from "@/lib/viewer";

export const metadata: Metadata = { title: "Mapa" };

function dayText(day: LocalDate): string {
  const n = Number(day.slice(8, 10));
  return `${n} de ${monthLabel(day).toLowerCase()}`;
}

function rangeText(startsOn: LocalDate, endsOn: LocalDate): string {
  return startsOn === endsOn ? dayText(startsOn) : `${dayText(startsOn)} – ${dayText(endsOn)}`;
}

function UpcomingPlans({ plans }: { plans: UpcomingPlan[] }) {
  if (plans.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Planes">
      <h2 className="text-body font-medium text-ink">Planes</h2>
      <ListCard>
        {plans.map((plan) => (
          <div key={plan.id} className="flex items-start gap-3 border-b border-line px-4 py-3">
            <span aria-hidden className="mt-0.5 inline-flex size-5 shrink-0 rounded border border-line" />
            <div className="flex flex-col gap-1">
              <p className="text-body text-ink">{planLine(plan.placeName, plan.guestName)}</p>
              <p className="text-small text-muted">
                {monthLabel(plan.monthStart)} · {rangeText(plan.startsOn, plan.endsOn)}
              </p>
            </div>
          </div>
        ))}
      </ListCard>
    </section>
  );
}

function placeLabels(pins: MapPinView[]): string[] {
  const keyed = pins.flatMap((pin) => (pin.placeKey ? [{ placeKey: pin.placeKey, placeName: pin.placeName }] : []));
  const counts = visitCounts(keyed);
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const pin of keyed) {
    if (seen.has(pin.placeKey)) continue;
    seen.add(pin.placeKey);
    const row = counts.get(pin.placeKey);
    if (!row || row.times < 1) continue;
    labels.push(visitLabel(row.placeName, row.times));
  }
  return labels;
}

function bondLines(pins: MapPinView[]): string[] {
  const byCompanion = new Map<string, { name: string; rows: { placeKey: string; status: "went"; companionId: string }[] }>();
  for (const pin of pins) {
    if (!pin.placeKey || !pin.companionId || !pin.companionName) continue;
    const group = byCompanion.get(pin.companionId) ?? { name: pin.companionName, rows: [] };
    group.rows.push({ placeKey: pin.placeKey, status: "went", companionId: pin.companionId });
    byCompanion.set(pin.companionId, group);
  }
  const lines: string[] = [];
  for (const [companionId, group] of byCompanion) {
    const line = bondStat(group.name, distinctPlaces(group.rows, companionId));
    if (line) lines.push(line);
  }
  return lines;
}

async function signedPhotos(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  try {
    const admin = createAdminClient();
    const pairs = await Promise.all(
      ids.map(async (id) => {
        const { data, error } = await supabase.rpc("outing_photo_path", { p_id: id });
        if (error || typeof data !== "string" || data.length === 0) return null;
        const signed = await admin.storage.from("outing-photos").createSignedUrl(data, 300);
        if (signed.error || !signed.data?.signedUrl) return null;
        return [id, signed.data.signedUrl] as const;
      }),
    );
    return new Map(pairs.filter((pair): pair is readonly [string, string] => pair !== null));
  } catch {
    return new Map();
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <Link href="/perfil" className="flex h-11 items-center gap-1 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Perfil
      </Link>
      <h1 className="text-display font-semibold text-ink">Mapa</h1>
      {children}
    </main>
  );
}

function InviteAnswer({ invite }: { invite: OutingInviteView | null }) {
  if (!invite) return null;
  return (
    <section className="flex flex-col gap-2 rounded-[15px] border border-line px-4 py-3" aria-label="Invitación">
      <p className="text-body text-ink">{invite.placeName}</p>
      <p className="text-small text-muted">{rangeText(invite.startsOn, invite.endsOn)}</p>
      {invite.status === "pending" ? (
        <div className="flex items-center gap-3">
          <form action={respondInviteFromForm}>
            <input type="hidden" name="id" value={invite.inviteId} />
            <input type="hidden" name="accept" value="1" />
            <Button type="submit">Aceptar</Button>
          </form>
          <form action={respondInviteFromForm}>
            <input type="hidden" name="id" value={invite.inviteId} />
            <input type="hidden" name="accept" value="0" />
            <button type="submit" className="inline-flex h-12 items-center text-body text-ink">
              Rechazar
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

async function acceptedFriends(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const { data: friendships, error } = await supabase
    .from("friendships")
    .select("requester_id,addressee_id")
    .eq("status", "accepted");
  if (error || !friendships) return [];
  const friendIds = friendships.map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id));
  if (friendIds.length === 0) return [];
  const { data: people } = await supabase.from("public_profiles").select("id,display_name").in("id", friendIds);
  return (people ?? []).flatMap((person) =>
    person.id && person.display_name ? [{ id: person.id, name: person.display_name }] : [],
  );
}

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<{ salida?: string | string[] }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect(await viewerMissingDestination());
  const params = await searchParams;
  const salida = Array.isArray(params.salida) ? params.salida[0] : params.salida;
  const supabase = await createServerClient();
  const rpc: Rpc = async (fn, args) => {
    const { data, error } = args ? await supabase.rpc(fn, args as never) : await supabase.rpc(fn);
    return { data, error: error ? { message: error.message } : null };
  };
  const [month, map, invite, friends, trips, months] = await Promise.all([
    loadMyMonth(rpc),
    loadMyMap(rpc),
    salida ? loadMyOutingInvite(rpc, salida) : Promise.resolve(null),
    acceptedFriends(supabase, viewer.id),
    loadMyTrips(rpc),
    loadMyMonthIndex(rpc),
  ]);
  const screen = mapScreen({
    monthOk: month.ok,
    mapOk: map.ok,
    completed: month.ok ? month.data.completed : 0,
    outingCount: month.ok ? month.data.outings.length : 0,
    pinCount: map.ok ? map.data.pins.length : 0,
  });
  const today = localDate(new Date(), viewer.timezone);
  const ownOutings = new Map<string, string>();
  if (month.ok) {
    for (const outing of month.data.outings) {
      if (outing.isOwner) ownOutings.set(outing.id, outing.placeName);
    }
  }
  if (map.ok) {
    for (const pin of [...map.data.pins, ...map.data.plans]) {
      if (pin.isOwner) ownOutings.set(pin.id, pin.placeName);
    }
  }
  if (!month.ok || !map.ok || screen.kind === "error") {
    return (
      <Shell>
        <InviteAnswer invite={invite} />
        <LoadFailed href="/mapa" />
      </Shell>
    );
  }

  const photos = await signedPhotos(supabase, [
    ...map.data.pins.map((pin) => pin.id),
    ...map.data.plans.map((plan) => plan.id),
    ...map.data.upcoming.map((plan) => plan.id),
    ...month.data.outings.filter((outing) => outing.isOwner || outing.inviteStatus === "accepted").map((outing) => outing.id),
  ]);
  const monthEmpty = screen.kind === "empty" || (screen.kind === "ready" && screen.showMonthEmptyCopy);
  const marks = mapMarks({
    visited: map.data.pins.map((pin) => ({
      id: pin.id,
      lat: pin.lat,
      lng: pin.lng,
      title: pin.placeName,
      address: pin.placeDetail ?? null,
    })),
    planned: [
      ...map.data.plans.map((plan) => ({ id: plan.id, lat: plan.lat, lng: plan.lng, title: plan.placeName })),
      ...month.data.outings
        .filter((outing) => outing.status === "planned")
        .map((outing) => ({ id: outing.id, lat: outing.lat, lng: outing.lng, title: outing.placeName })),
      ...map.data.upcoming.map((plan) => ({ id: plan.id, lat: plan.lat, lng: plan.lng, title: plan.placeName })),
    ],
  });
  const showPlaces = screen.kind === "ready" || marks.length > 0;
  const zones = map.data.pins.length > 0 ? await cityZones(map.data.pins) : [];
  const cards: Record<string, PlaceCardData> = {};
  for (const pin of map.data.pins) {
    cards[pin.id] = {
      id: pin.id,
      title: pin.placeName,
      address: pin.placeDetail ?? null,
      lat: pin.lat,
      lng: pin.lng,
      when: pin.wentOn ? `${dayText(pin.wentOn)} de ${pin.wentOn.slice(0, 4)}` : "Sin fecha",
      photo: photos.get(pin.id) ?? null,
      owner: pin.isOwner !== false,
      canPhoto: true,
      memory: true,
      placeName: pin.placeName,
      placeKey: pin.placeKey,
      placeDetail: pin.placeDetail,
      startsOn: pin.wentOn ?? today,
      endsOn: pin.wentOn ?? today,
      note: pin.note ?? null,
      rememberedOn: pin.wentOn ?? "",
      today,
    };
  }
  for (const outing of month.data.outings) {
    if (cards[outing.id]) continue;
    const withName = outing.companionName && outing.inviteStatus !== null ? outing.companionName : outing.guestName;
    cards[outing.id] = {
      id: outing.id,
      title: planLine(outing.placeName, withName),
      address: outing.placeDetail,
      lat: outing.lat,
      lng: outing.lng,
      when: rangeText(outing.startsOn, outing.endsOn),
      photo: photos.get(outing.id) ?? null,
      owner: outing.isOwner,
      canPhoto: outing.isOwner || outing.inviteStatus === "accepted",
      memory: outing.status === "went",
      placeName: outing.placeName,
      placeKey: outing.placeKey,
      placeDetail: outing.placeDetail,
      startsOn: outing.startsOn,
      endsOn: outing.endsOn,
      note: outing.note,
      rememberedOn: outing.wentOn ?? "",
      today,
    };
  }
  for (const plan of [...map.data.plans, ...map.data.upcoming]) {
    if (cards[plan.id]) continue;
    const startsOn = plan.startsOn ?? today;
    const endsOn = plan.endsOn ?? startsOn;
    cards[plan.id] = {
      id: plan.id,
      title: plan.placeName,
      address: plan.placeDetail ?? null,
      lat: plan.lat,
      lng: plan.lng,
      when: plan.startsOn && plan.endsOn ? rangeText(plan.startsOn, plan.endsOn) : "Planeado",
      photo: photos.get(plan.id) ?? null,
      owner: plan.isOwner !== false,
      canPhoto: plan.isOwner !== false,
      memory: false,
      placeName: plan.placeName,
      placeKey: plan.placeKey,
      placeDetail: plan.placeDetail,
      startsOn,
      endsOn,
      note: plan.note ?? null,
      rememberedOn: "",
      today,
    };
  }

  return (
    <Shell>
      <InviteAnswer invite={invite} />
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body text-ink">{monthLabel(month.data.monthStart)}</p>
        <p className="font-mono text-[14px] font-medium text-ink">{screen.floorLabel}</p>
      </div>
      {showPlaces ? (
        <>
          <MapBoard pins={marks} zones={zones} cards={cards} />
          {marks.some((mark) => mark.visited) ? (
            <p className="text-small text-muted">En color están los lugares que ya visitaste.</p>
          ) : null}
          {placeLabels(map.data.pins).map((label) => (
            <p key={label} className="text-small text-muted">
              {label}
            </p>
          ))}
          {bondLines(map.data.pins).map((line) => (
            <p key={line} className="text-small text-muted">
              {line}
            </p>
          ))}
          <ListCard>
            {monthEmpty ? (
              <p className="px-4 py-3 text-body text-muted">Este mes todavía no tiene una salida.</p>
            ) : (
              month.data.outings.map((outing) => {
                const canMark = outing.status === "planned" && canMarkWent(today, outing.startsOn, month.data.monthStart);
                const withName =
                  outing.companionName && outing.inviteStatus !== null ? outing.companionName : outing.guestName;
                const title = planLine(outing.placeName, withName);
                const box = (
                  <span
                    aria-hidden
                    className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border ${outing.status === "went" ? "border-accent bg-accent text-paper" : "border-line"}`}
                  >
                    {outing.status === "went" ? <Check size={14} weight="bold" /> : null}
                  </span>
                );
                return (
                  <div key={outing.id} className="flex flex-col gap-2 border-b border-line px-4 py-3">
                    <div className="flex items-start gap-3">
                      {canMark ? (
                        <form action={markOutingWentFromForm}>
                          <input type="hidden" name="id" value={outing.id} />
                          <button type="submit" aria-label={`Marcar ${outing.placeName}`} className="inline-flex">
                            {box}
                          </button>
                        </form>
                      ) : (
                        box
                      )}
                      <div className="flex flex-col gap-1">
                        <p className="text-body text-ink">{title}</p>
                        <p className="text-small text-muted">{rangeText(outing.startsOn, outing.endsOn)}</p>
                      </div>
                    </div>
                    <p className="text-small text-ink">{outing.status === "went" ? "Fui" : "Planeado"}</p>
                    {outing.inviteStatus === "pending" ? <p className="text-small text-muted">Invitación pendiente</p> : null}
                    {outing.status === "planned" && !canMark ? (
                      <p className="text-small text-muted">Puedes marcar Fui desde el {dayText(outing.startsOn)}.</p>
                    ) : null}
                    {outing.isOwner && outing.status === "planned" && outing.inviteStatus === null ? (
                      <InviteCompanion outingId={outing.id} friends={friends} />
                    ) : null}
                    {outing.isOwner && outing.status === "went" ? <RepeatOuting outingId={outing.id} /> : null}
                  </div>
                );
              })
            )}
          </ListCard>
          <UpcomingPlans plans={map.data.upcoming} />
          {months.ok ? (
            months.data.length > 0 ? (
              <section className="flex flex-col gap-2" aria-label="Meses">
                <h2 className="text-body font-medium text-ink">Meses</h2>
                <ListCard>
                  {months.data.map((row) => (
                    <p key={row.monthStart} className="border-b border-line px-4 py-3 text-body text-ink">
                      {monthIndexLabel(row.monthStart, row.completed)}
                    </p>
                  ))}
                </ListCard>
              </section>
            ) : null
          ) : (
            <LoadFailed href="/mapa" />
          )}
          {trips.ok ? (
            trips.data.length > 0 ? (
              <section className="flex flex-col gap-2" aria-label="Viajes">
                <h2 className="text-body font-medium text-ink">Viajes</h2>
                <ListCard>
                  {trips.data.map((trip) => (
                    <Link key={trip.id} href={`/mapa/viajes/${trip.id}`} className="flex min-h-[52px] items-center border-b border-line px-4 py-3 text-body text-ink">
                      {trip.name}
                    </Link>
                  ))}
                </ListCard>
              </section>
            ) : null
          ) : (
            <LoadFailed href="/mapa" />
          )}
          <CreateTrip outings={[...ownOutings].map(([id, placeName]) => ({ id, placeName }))} />
          <div className="flex flex-wrap gap-3">
            <OutingForm month={month.data.monthStart} today={today} allowedMonths={upcomingMonthStarts(today)} company={{ friends }} />
            <OutingForm month={month.data.monthStart} today={today} title="Ya estuve" memory />
          </div>
        </>
      ) : (
        <>
          <MapBoard pins={[]} zones={[]} cards={{}} />
          {!months.ok || !trips.ok ? <LoadFailed href="/mapa" /> : null}
          <UpcomingPlans plans={map.data.upcoming} />
          <EmptyState
            mark={<CatAnimation asset="plan" width={168} />}
            title="Todavía no marcas un lugar"
            body="Busca un lugar y elige los días. Con una salida el mes queda cumplido."
            action={
              <div className="flex flex-wrap gap-3">
                <OutingForm month={month.data.monthStart} today={today} allowedMonths={upcomingMonthStarts(today)} company={{ friends }} />
                <OutingForm month={month.data.monthStart} today={today} title="Ya estuve" memory />
              </div>
            }
          />
        </>
      )}
    </Shell>
  );
}
