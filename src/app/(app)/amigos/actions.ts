"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadFeedPage } from "@/lib/activity-feed";
import { parseCursor, parseFilter, type FeedPage } from "@/lib/feed";
import { PAGE_SIZE, REQUEST_LIMIT_COPY, loadPeople, type Person } from "@/lib/discover-data";
import { INVITE_ERRORS, INVITE_GENERIC, inviteErrorKey } from "@/lib/invites";
import { notify } from "@/lib/notify";
import { requireUser } from "@/lib/require-user";
import { siteOrigin } from "@/lib/site-url";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
type RequestResult = { ok: true; status: "pending" | "accepted" } | { ok: false; error: string };

const GENERIC = INVITE_GENERIC;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh() {
  revalidatePath("/amigos");
  revalidatePath("/amigos/explorar");
}

async function currentUserId() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, uid: data.user?.id ?? null };
}

/**
 * Next page of Explorar ("Ver más"). The query and the offset come from the client and are
 * re-validated; the read is discover_people through the caller's own session.
 */
export async function loadMorePeople(
  query: unknown,
  offset: unknown,
): Promise<{ ok: true; people: Person[]; hasMore: boolean } | { ok: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 1000) {
    return { ok: false, error: GENERIC };
  }
  return loadPeople({ query: typeof query === "string" ? query : null, offset, limit: PAGE_SIZE, client: auth.supabase });
}

export async function sendFriendRequest(userId: string): Promise<RequestResult> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  return requestFrom(auth.supabase, auth.userId, userId, false);
}

type Client = Awaited<ReturnType<typeof createServerClient>>;

async function requestFrom(supabase: Client, uid: string, userId: string, retried: boolean): Promise<RequestResult> {
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
  if (error?.code === "23505" && !retried) return requestFrom(supabase, uid, userId, true);
  if (error?.message?.includes("request_limit")) return { ok: false, error: REQUEST_LIMIT_COPY };
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
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const name = (typeof username === "string" ? username : "").toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,20}$/.test(name)) return { ok: false, error: "No encontramos a esa persona." };
  const { data } = await auth.supabase.from("public_profiles").select("id").eq("username", name).maybeSingle();
  if (!data?.id) return { ok: false, error: "No encontramos a esa persona." };
  return requestFrom(auth.supabase, auth.userId, data.id, false);
}

/** The requester withdraws a pending request they sent (client DELETE of a pending row under RLS). */
export async function cancelFriendRequest(userId: string): Promise<Result> {
  return dropPending(userId, "sent");
}

/** The addressee rejects a pending request without needing its row id. */
export async function declineFriendRequest(userId: string): Promise<Result> {
  return dropPending(userId, "received");
}

async function dropPending(userId: string, side: "sent" | "received"): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof userId !== "string" || !UUID.test(userId)) return { ok: false, error: GENERIC };
  const { data, error } = await auth.supabase
    .from("friendships")
    .delete()
    .eq("requester_id", side === "sent" ? auth.userId : userId)
    .eq("addressee_id", side === "sent" ? userId : auth.userId)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: GENERIC };
  if (!data || data.length === 0) return { ok: false, error: "Esta solicitud ya no existe." };
  refresh();
  return { ok: true };
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

/**
 * Next page of the Amigos activity feed ("Ver más", filter chips). Cursor and filter come from the
 * client and are re-validated; reads go through the user's own session (RLS).
 */
export async function loadActivity(input: {
  cursor?: unknown;
  filter?: unknown;
}): Promise<{ ok: true; page: FeedPage } | { ok: false; error: string }> {
  const { supabase, uid } = await currentUserId();
  if (!uid) return { ok: false, error: INVITE_ERRORS.not_authenticated };
  const raw = input && typeof input === "object" ? input : {};
  const cursor = raw.cursor == null ? null : parseCursor(raw.cursor);
  if (raw.cursor != null && !cursor) return { ok: false, error: GENERIC };
  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", uid).maybeSingle();
  try {
    const page = await loadFeedPage(supabase, uid, {
      timezone: me?.timezone ?? "UTC",
      filter: parseFilter(raw.filter),
      cursor,
    });
    return { ok: true, page };
  } catch {
    return { ok: false, error: "No pudimos cargar la actividad. Inténtalo de nuevo." };
  }
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
