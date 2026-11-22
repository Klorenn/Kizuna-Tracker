"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { cancelChallengesBetween } from "../retos/actions";

type Result = { ok: true } | { ok: false; error: string };
type RequestResult = { ok: true; status: "pending" | "accepted" } | { ok: false; error: string };

const GENERIC = "No pudimos completar la acción. Inténtalo de nuevo.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITE_DAYS = 7;
const INVITE_ERRORS: Record<string, string> = {
  invite_not_found: "No encontramos esta invitación.",
  invite_expired: "Esta invitación venció.",
  invite_self: "Esta invitación es tuya. Compártela con un amigo.",
  not_authenticated: "Inicia sesión para continuar.",
};

function refresh() {
  revalidatePath("/amigos");
}

async function currentUserId() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, uid: data.user?.id ?? null };
}

export type UserHit = { id: string; username: string; displayName: string; avatarPath: string | null };

/** Username prefix search (max 20) through the 4-column public_profiles view. */
export async function searchUsers(q: string): Promise<UserHit[]> {
  const term = (typeof q === "string" ? q : "").trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{1,20}$/.test(term)) return [];
  const { supabase, uid } = await currentUserId();
  if (!uid) return [];
  const { data } = await supabase
    .from("public_profiles")
    .select("id,username,display_name,avatar_path")
    .ilike("username", `${term.replaceAll("_", "\\_")}%`)
    .neq("id", uid)
    .order("username")
    .limit(20);
  return (data ?? []).flatMap((p) =>
    p.id && p.username && p.display_name
      ? [{ id: p.id, username: p.username, displayName: p.display_name, avatarPath: p.avatar_path }]
      : [],
  );
}

export async function sendFriendRequest(userId: string): Promise<RequestResult> {
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated };
  if (userId === uid) return { ok: false, error: "No puedes agregarte a ti mismo." };
  if (typeof userId !== "string" || !UUID.test(userId)) return { ok: false, error: GENERIC };

  const { data: target } = await supabase
    .from("public_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "No encontramos a esa persona." };

  const { data: existing, error: readError } = await supabase
    .from("friendships")
    .select("id,requester_id,addressee_id,status")
    .or(
      `and(requester_id.eq.${uid},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${uid})`,
    );
  if (readError) return { ok: false, error: GENERIC };
  const row = existing?.[0];

  if (row) {
    if (row.status === "accepted") return { ok: true, status: "accepted" };
    if (row.requester_id === uid) return { ok: true, status: "pending" };
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", row.id);
    if (error) return { ok: false, error: GENERIC };
    refresh();
    return { ok: true, status: "accepted" };
  }

  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: uid, addressee_id: userId, status: "pending" });
  if (error) return { ok: false, error: GENERIC };
  refresh();
  return { ok: true, status: "pending" };
}

export async function addFriendByUsername(username: string): Promise<RequestResult> {
  const name = (typeof username === "string" ? username : "").toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,20}$/.test(name)) return { ok: false, error: "No encontramos a esa persona." };
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated };
  const { data } = await supabase.from("public_profiles").select("id").eq("username", name).maybeSingle();
  if (!data?.id) return { ok: false, error: "No encontramos a esa persona." };
  return sendFriendRequest(data.id);
}

export async function respondFriendRequest(id: string, accept: boolean): Promise<Result> {
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated };
  const { error } = accept
    ? await supabase.from("friendships").update({ status: "accepted" }).eq("id", id)
    : await supabase.from("friendships").delete().eq("id", id).eq("status", "pending");
  if (error) return { ok: false, error: GENERIC };
  refresh();
  return { ok: true };
}

export async function removeFriend(userId: string): Promise<Result> {
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated };
  if (typeof userId !== "string" || !UUID.test(userId)) return { ok: false, error: GENERIC };
  await cancelChallengesBetween(uid, userId);
  const { error } = await supabase
    .from("friendships")
    .delete()
    .or(
      `and(requester_id.eq.${uid},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${uid})`,
    );
  if (error) return { ok: false, error: GENERIC };
  refresh();
  return { ok: true };
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Creates a 7-day invite. Returns `{ ok, url }` (union, never throws). */
export async function createInvite(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated };
  const expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("invites")
    .insert({ inviter_id: uid, expires_at: expires })
    .select("code")
    .single();
  if (error || !data) return { ok: false, error: GENERIC };
  return { ok: true, url: `${await requestOrigin()}/invite/${data.code}` };
}

export async function acceptInvite(
  code: string,
): Promise<{ ok: true; inviterUsername: string } | { ok: false; error: string }> {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
    return { ok: false, error: INVITE_ERRORS.invite_not_found };
  }
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated };
  const { data: inviterId, error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error || !inviterId) {
    const key = Object.keys(INVITE_ERRORS).find((k) => error?.message?.includes(k));
    return { ok: false, error: key ? INVITE_ERRORS[key] : GENERIC };
  }
  const { data: inviter } = await supabase
    .from("public_profiles")
    .select("username")
    .eq("id", inviterId)
    .maybeSingle();
  refresh();
  return { ok: true, inviterUsername: inviter?.username ?? "" };
}
