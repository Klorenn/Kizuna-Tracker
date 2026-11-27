"use server";

import { revalidatePath } from "next/cache";
import type { PlacePick } from "@/domain/outings";
import type { LocalDate } from "@/domain/types";
import { notify } from "@/lib/notify";
import {
  addTripStopWith,
  cancelOutingWith,
  createOutingWith,
  createTripWith,
  setTripLinkWith,
  inviteCompanionWith,
  markWentWith,
  repeatOutingWith,
  respondInviteWith,
  updateOutingWith,
  type OutingActionDeps,
  type Rpc,
} from "@/lib/outing-actions";
import { createServerClient } from "@/lib/supabase/server";
import { getViewerProfile } from "@/lib/viewer";

function refresh(extra?: string) {
  revalidatePath("/mapa");
  revalidatePath("/");
  revalidatePath("/metas");
  if (extra) revalidatePath(extra);
}

async function clientRpc(): Promise<Rpc> {
  const supabase = await createServerClient();
  return async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, (args ?? {}) as never);
    return { data, error: error ? { message: error.message } : null };
  };
}

async function noticeDeps(): Promise<OutingActionDeps> {
  const [rpc, profile] = await Promise.all([clientRpc(), getViewerProfile()]);
  return { rpc, notify, fromName: profile?.firstName ?? null };
}

export async function createOuting(input: {
  place: PlacePick;
  startsOn: string;
  endsOn: string;
  note: string;
  month: LocalDate;
}) {
  const result = await createOutingWith(await clientRpc(), input);
  if (result.ok) refresh();
  return result;
}

export async function updateOuting(input: {
  id: string;
  place: PlacePick;
  startsOn: string;
  endsOn: string;
  note: string;
  month: LocalDate;
}) {
  const result = await updateOutingWith(await clientRpc(), input);
  if (result.ok) refresh();
  return result;
}

export async function markOutingWent(id: string) {
  const result = await markWentWith(await clientRpc(), id);
  if (result.ok) refresh();
  return result;
}

export async function markOutingWentFromForm(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) return;
  await markOutingWent(id);
}

export async function cancelOuting(id: string) {
  const result = await cancelOutingWith(await noticeDeps(), id);
  if (result.ok) refresh();
  return result;
}

export async function cancelOutingFromForm(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) return;
  await cancelOuting(id);
}

export async function inviteCompanion(outingId: string, friendId: string) {
  const result = await inviteCompanionWith(await noticeDeps(), { outingId, friendId });
  if (result.ok) refresh();
  return result;
}

export async function respondInvite(inviteId: string, accept: boolean) {
  const result = await respondInviteWith(await noticeDeps(), { inviteId, accept });
  if (result.ok) refresh();
  return result;
}

export async function respondInviteFromForm(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) return;
  await respondInvite(id, formData.get("accept") === "1");
}

export async function repeatOuting(id: string) {
  const result = await repeatOutingWith(await clientRpc(), id);
  if (result.ok) refresh();
  return result;
}

export async function repeatOutingFromForm(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) return;
  await repeatOuting(id);
}

export async function createTrip(input: { name: string; outingIds: string[] }) {
  const result = await createTripWith(await clientRpc(), input);
  if (result.ok) refresh(`/mapa/viajes/${result.id}`);
  return result;
}

export async function setTripLink(tripId: string, link: string | null) {
  const result = await setTripLinkWith(await clientRpc(), { tripId, link });
  if (result.ok) refresh(`/mapa/viajes/${tripId}`);
  return result;
}

export async function addTripStop(input: {
  tripId: string;
  place: PlacePick;
  startsOn: string;
  endsOn: string;
  note: string;
  month: LocalDate;
  allowedMonths: LocalDate[];
}) {
  const result = await addTripStopWith(await clientRpc(), input);
  if (result.ok) refresh(`/mapa/viajes/${input.tripId}`);
  return result;
}
