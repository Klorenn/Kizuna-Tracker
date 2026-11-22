"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { INVITE_ERRORS, INVITE_GENERIC, inviteErrorKey } from "@/lib/invites";
import { notify } from "@/lib/notify";
import { siteOrigin } from "@/lib/site-url";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
type RequestResult = { ok: true; status: "pending" | "accepted" } | { ok: false; error: string };

const GENERIC = INVITE_GENERIC;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function sendFriendRequest(userId: string, retried = false): Promise<RequestResult> {
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
  // unique pair index: someone created the row in between, read it again
  if (error?.code === "23505" && !retried) return sendFriendRequest(userId, true);
  if (error) return { ok: false, error: GENERIC };
  const { data: me } = await supabase
    .from("public_profiles")
    .select("username,display_name")
    .eq("id", uid)
    .maybeSingle();
  await notify(userId, "friend_request", {
    from_id: uid,
    from_username: me?.username ?? null,
    from_name: me?.display_name ?? null,
  }, { defer: true });
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
  const { data, error } = accept
    ? await supabase.from("friendships").update({ status: "accepted" }).eq("id", id).select("id")
    : await supabase.from("friendships").delete().eq("id", id).eq("status", "pending").select("id");
  if (error) return { ok: false, error: GENERIC };
  if (!data || data.length === 0) return { ok: false, error: "Esta solicitud ya no existe." };
  refresh();
  return { ok: true };
}

export async function removeFriend(userId: string): Promise<Result> {
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated };
  if (typeof userId !== "string" || !UUID.test(userId)) return { ok: false, error: GENERIC };
  const { data, error } = await supabase.rpc("remove_friend", { p_other: userId });
  if (error) return { ok: false, error: GENERIC };
  if (!data) return { ok: false, error: "Esta persona ya no está en tus amigos." };
  revalidatePath("/retos");
  refresh();
  return { ok: true };
}

/** Creates a server-side 7-day invite (create_invite RPC). Union, never throws. */
export async function createInvite(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated };
  const { data: code, error } = await supabase.rpc("create_invite");
  if (error || !code) {
    const key = inviteErrorKey(error?.message);
    return { ok: false, error: key ? INVITE_ERRORS[key] : GENERIC };
  }
  return { ok: true, url: `${siteOrigin(await headers())}/invite/${code}` };
}

type AcceptResult =
  | { ok: true; inviterUsername: string }
  | { ok: false; error: string; key: string | null };

async function acceptInviteCore(code: string): Promise<AcceptResult> {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
    return { ok: false, error: INVITE_ERRORS.invite_not_found, key: "invite_not_found" };
  }
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated, key: "not_authenticated" };
  const { data: inviterId, error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error || !inviterId) {
    const key = inviteErrorKey(error?.message);
    return { ok: false, error: key ? INVITE_ERRORS[key] : GENERIC, key };
  }
  const { data: inviter } = await supabase
    .from("public_profiles")
    .select("username")
    .eq("id", inviterId)
    .maybeSingle();
  refresh();
  return { ok: true, inviterUsername: inviter?.username ?? "" };
}

export async function acceptInvite(
  code: string,
): Promise<{ ok: true; inviterUsername: string } | { ok: false; error: string }> {
  const r = await acceptInviteCore(code);
  return r.ok ? r : { ok: false, error: r.error };
}

/** Form action behind "Aceptar invitación" (POST, Origin-checked by Next). Never runs on GET. */
export async function acceptInviteAction(code: string): Promise<void> {
  const r = await acceptInviteCore(code);
  if (r.ok) {
    redirect(r.inviterUsername ? `/amigos?amigo=${encodeURIComponent(r.inviterUsername)}` : "/amigos");
  }
  redirect(`/invite/${encodeURIComponent(code)}?error=${r.key ?? "generic"}`);
}
