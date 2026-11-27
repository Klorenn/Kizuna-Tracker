import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoadFailed } from "@/components/LoadFailed";
import { InviteCompanion } from "@/components/map/InviteCompanion";
import { OutingForm } from "@/components/map/OutingForm";
import { OutingMapLazy } from "@/components/map/OutingMapLazy";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListCard } from "@/components/ui/ListRow";
import { localDate } from "@/domain/dates";
import { canMarkWent, mapScreen, monthIndexLabel, monthLabel, outingTitle, visitCounts, visitLabel } from "@/domain/outings";
import type { LocalDate } from "@/domain/types";
import { CreateTrip } from "@/components/map/CreateTrip";
import { OutingPhotoUpload } from "@/components/map/OutingPhotoUpload";
import { RepeatOuting } from "@/components/map/RepeatOuting";
import { bondStat, distinctPlaces } from "@/domain/outing-memory";
import { cancelOutingFromForm, markOutingWentFromForm, respondInviteFromForm } from "@/app/(app)/mapa/actions";
import { loadMyMap, loadMyMonth, loadMyOutingInvite, type MapPinView, type OutingInviteView, type Rpc } from "@/lib/outings-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
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

  const monthIds = month.data.outings.map((outing) => outing.id);
  const remembered = [...map.data.pins, ...map.data.plans].filter((row) => !monthIds.includes(row.id));
  const photos = await signedPhotos(supabase, [
    ...month.data.outings.filter((outing) => outing.isOwner || outing.inviteStatus === "accepted").map((outing) => outing.id),
    ...remembered.map((row) => row.id),
  ]);
  const monthEmpty = screen.kind === "empty" || (screen.kind === "ready" && screen.showMonthEmptyCopy);
  const showPlaces = screen.kind === "ready" || map.data.plans.length > 0;

  return (
    <Shell>
      <InviteAnswer invite={invite} />
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body text-ink">{monthLabel(month.data.monthStart)}</p>
        <p className="font-mono text-[14px] font-medium text-ink">{screen.floorLabel}</p>
      </div>
      {showPlaces ? (
        <>
          <div className="h-[280px] overflow-hidden rounded-[15px] border border-line">
            <OutingMapLazy
              pins={map.data.pins.map((pin) => ({
                id: pin.id,
                lat: pin.lat,
                lng: pin.lng,
                title: pin.placeName,
              }))}
            />
          </div>
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
          {remembered.length > 0 ? (
            <ListCard>
              {remembered.map((row) => (
                <div key={row.id} className="flex flex-col gap-2 border-b border-line px-4 py-3">
                  <p className="text-body text-ink">{row.placeName}</p>
                  <OutingPhotoUpload outingId={row.id} src={photos.get(row.id) ?? null} />
                </div>
              ))}
            </ListCard>
          ) : null}
          <ListCard>
            {monthEmpty ? (
              <p className="px-4 py-3 text-body text-muted">Este mes todavía no tiene una salida.</p>
            ) : (
              month.data.outings.map((outing) => {
                const canMark = outing.status === "planned" && canMarkWent(today, outing.startsOn, month.data.monthStart);
                const title =
                  outing.inviteStatus === "accepted" && outing.companionName
                    ? outingTitle(outing.placeName, { name: outing.companionName, status: "accepted" })
                    : outing.placeName;
                return (
                  <div key={outing.id} className="flex flex-col gap-2 border-b border-line px-4 py-3">
                    <p className="text-body text-ink">{title}</p>
                    <p className="text-small text-muted">{rangeText(outing.startsOn, outing.endsOn)}</p>
                    <p className="text-small text-ink">{outing.status === "went" ? "Fui" : "Planeado"}</p>
                    {outing.inviteStatus === "pending" ? <p className="text-small text-muted">Invitación pendiente</p> : null}
                    {outing.status === "planned" && !canMark ? (
                      <p className="text-small text-muted">Puedes marcar Fui desde el {dayText(outing.startsOn)}.</p>
                    ) : null}
                    {canMark ? (
                      <form action={markOutingWentFromForm}>
                        <input type="hidden" name="id" value={outing.id} />
                        <Button type="submit">Fui</Button>
                      </form>
                    ) : null}
                    {outing.isOwner && outing.status === "planned" && outing.inviteStatus === null ? (
                      <InviteCompanion outingId={outing.id} friends={friends} />
                    ) : null}
                    {outing.isOwner && outing.status === "planned" ? (
                      <form action={cancelOutingFromForm}>
                        <input type="hidden" name="id" value={outing.id} />
                        <button type="submit" className="inline-flex h-12 items-center text-body text-ink">
                          Quitar
                        </button>
                      </form>
                    ) : null}
                    {outing.isOwner && outing.status === "went" ? <RepeatOuting outingId={outing.id} /> : null}
                    {outing.isOwner || outing.inviteStatus === "accepted" ? (
                      <OutingPhotoUpload outingId={outing.id} src={photos.get(outing.id) ?? null} />
                    ) : null}
                  </div>
                );
              })
            )}
          </ListCard>
          {map.data.plans.length > 0 ? (
            <ListCard>
              {map.data.plans.map((plan) => (
                <div key={plan.id} className="flex flex-col gap-1 border-b border-line px-4 py-3">
                  <p className="text-body text-ink">{plan.placeName}</p>
                  <p className="text-small text-muted">Planeado</p>
                </div>
              ))}
            </ListCard>
          ) : null}
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
          <OutingForm month={month.data.monthStart} today={today} />
        </>
      ) : (
        <>
          {!months.ok || !trips.ok ? <LoadFailed href="/mapa" /> : null}
          <EmptyState
            title="Todavía no marcas un lugar"
            body="Busca un lugar y elige los días. Con una salida el mes queda cumplido."
            action={<OutingForm month={month.data.monthStart} today={today} />}
          />
        </>
      )}
    </Shell>
  );
}
