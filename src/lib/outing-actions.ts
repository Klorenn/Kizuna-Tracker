import { datesInsideMonth, validateOutingDraft, type PlacePick } from "@/domain/outings";
import type { LocalDate } from "@/domain/types";
import type { NotificationType } from "@/lib/notification-copy";
import type { Rpc } from "@/lib/outings-data";

export type { Rpc };

const COPY: Record<string, string> = {
  invalid_place: "No encontramos ese lugar.",
  invalid_dates: "Esas fechas no caben en este mes.",
  invalid_note: "La nota puede tener hasta 280 caracteres.",
  too_early: "Puedes marcar Fui desde el día en que empieza.",
  month_closed: "Ese mes ya cerró. Quedó vacío.",
  outing_closed: "Esta salida ya quedó marcada.",
  not_friend: "Solo puedes invitar a un amigo.",
  already_invited: "Ya invitaste a alguien a esta salida.",
  invite_closed: "Esta invitación ya no está pendiente.",
  trip_needs_two: "Un viaje necesita al menos dos paradas.",
  stop_month: "Esa fecha no cae en un mes de este viaje.",
  trip_name: "El nombre del viaje puede tener hasta 60 caracteres.",
};

const GENERIC = "No pudimos guardar la salida. Inténtalo de nuevo.";

export function outingErrorCopy(message: string | null): string {
  if (!message) return GENERIC;
  for (const [code, text] of Object.entries(COPY)) {
    if (message.includes(code)) return text;
  }
  return GENERIC;
}

type Draft = {
  place: PlacePick | null;
  startsOn: string;
  endsOn: string;
  note: string;
  month: LocalDate;
};

export async function createOutingWith(
  rpc: Rpc,
  input: Draft,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const check = validateOutingDraft(input);
  if (!check.ok || !input.place) return { ok: false, error: check.ok ? GENERIC : check.error };
  const { data, error } = await rpc("create_outing", placeArgs(input.place, input.startsOn, input.endsOn, input.note));
  if (error || typeof data !== "string" || data.length === 0) return { ok: false, error: outingErrorCopy(error?.message ?? null) };
  return { ok: true, id: data };
}

export async function updateOutingWith(
  rpc: Rpc,
  input: Draft & { id: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = validateOutingDraft(input);
  if (!check.ok || !input.place) return { ok: false, error: check.ok ? GENERIC : check.error };
  const { error } = await rpc("update_outing", {
    p_id: input.id,
    ...placeArgs(input.place, input.startsOn, input.endsOn, input.note),
  });
  if (error) return { ok: false, error: outingErrorCopy(error.message) };
  return { ok: true };
}

export async function markWentWith(rpc: Rpc, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await rpc("mark_outing_went", { p_id: id });
  if (error) return { ok: false, error: outingErrorCopy(error.message) };
  return { ok: true };
}

export type OutingActionDeps = {
  rpc: Rpc;
  notify: (userId: string, type: NotificationType, payload: Record<string, unknown>) => Promise<void>;
  fromName?: string | null;
};

export async function inviteCompanionWith(
  deps: OutingActionDeps,
  input: { outingId: string; friendId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await deps.rpc("invite_outing_companion", {
    p_outing_id: input.outingId,
    p_friend_id: input.friendId,
  });
  if (error || typeof data !== "string" || data.length === 0) {
    return { ok: false, error: outingErrorCopy(error?.message ?? null) };
  }
  await safeNotify(deps, input.friendId, "outing_invited", noticePayload({ outing_id: input.outingId }, deps.fromName));
  return { ok: true };
}

export async function respondInviteWith(
  deps: OutingActionDeps,
  input: { inviteId: string; accept: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await deps.rpc("respond_outing_invite", {
    p_invite_id: input.inviteId,
    p_accept: input.accept,
  });
  if (error || !isRecord(data) || typeof data.owner_id !== "string" || data.owner_id.length === 0) {
    return { ok: false, error: outingErrorCopy(error?.message ?? null) };
  }
  await safeNotify(
    deps,
    data.owner_id,
    input.accept ? "outing_accepted" : "outing_declined",
    noticePayload({ place_name: data.place_name, outing_id: data.outing_id }, deps.fromName),
  );
  return { ok: true };
}

export async function cancelOutingWith(
  deps: OutingActionDeps,
  id: string,
): Promise<{ ok: true; inviteeId: string | null } | { ok: false; error: string }> {
  const { data, error } = await deps.rpc("cancel_outing", { p_id: id });
  if (error) return { ok: false, error: outingErrorCopy(error.message) };
  const inviteeId = isRecord(data) && typeof data.invitee_id === "string" && data.invitee_id.length > 0 ? data.invitee_id : null;
  if (inviteeId) {
    await safeNotify(
      deps,
      inviteeId,
      "outing_cancelled",
      noticePayload({ outing_id: id, place_name: isRecord(data) ? data.place_name : null }, deps.fromName),
    );
  }
  return { ok: true, inviteeId };
}

async function safeNotify(
  deps: OutingActionDeps,
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await deps.notify(userId, type, payload);
  } catch {
    // The outing row already changed. A failed notice does not undo it.
  }
}

function noticePayload(fields: Record<string, unknown>, fromName?: string | null): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.length > 0) payload[key] = value;
  }
  if (typeof fromName === "string" && fromName.length > 0) payload.from_name = fromName;
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function repeatOutingWith(
  rpc: Rpc,
  id: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await rpc("repeat_outing", { p_id: id });
  if (error || typeof data !== "string" || data.length === 0) {
    return { ok: false, error: outingErrorCopy(error?.message ?? null) };
  }
  return { ok: true, id: data };
}

export async function createTripWith(
  rpc: Rpc,
  input: { name: string; outingIds: string[] },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 60) return { ok: false, error: outingErrorCopy("trip_name") };
  const ids = [...new Set(input.outingIds)];
  if (ids.length < 2) return { ok: false, error: outingErrorCopy("trip_needs_two") };
  const { data, error } = await rpc("create_trip", { p_name: name, p_outing_ids: ids });
  if (error || typeof data !== "string" || data.length === 0) {
    return { ok: false, error: outingErrorCopy(error?.message ?? null) };
  }
  return { ok: true, id: data };
}

export async function addTripStopWith(
  rpc: Rpc,
  input: Draft & { tripId: string; allowedMonths: LocalDate[] },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const month = input.allowedMonths.find((start) => datesInsideMonth(input.startsOn, input.endsOn, start));
  if (!month || !input.place) return { ok: false, error: outingErrorCopy("stop_month") };
  const check = validateOutingDraft({ ...input, month });
  if (!check.ok) return { ok: false, error: check.error };
  const { data, error } = await rpc("add_trip_stop", {
    p_trip_id: input.tripId,
    ...placeArgs(input.place, input.startsOn, input.endsOn, input.note),
  });
  if (error || typeof data !== "string" || data.length === 0) {
    return { ok: false, error: outingErrorCopy(error?.message ?? null) };
  }
  return { ok: true, id: data };
}

function placeArgs(place: PlacePick, startsOn: string, endsOn: string, note: string) {
  return {
    p_place_name: place.name,
    p_place_detail: place.detail,
    p_place_key: place.placeKey,
    p_lat: place.lat,
    p_lng: place.lng,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
    p_note: note,
  };
}
