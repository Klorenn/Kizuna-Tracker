"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createHabit } from "@/app/(app)/habitos/actions";
import { toHabitColor } from "@/domain/habit-colors";
import {
  INVALID_GROUP_COPY,
  isInviteCodeShape,
  isLocalDate,
  isUuid,
  validateCommitment,
  validateGroupDraft,
  validateGroupFields,
  validateHabitChoice,
} from "@/domain/groups";
import type { HabitDraft, IconKey } from "@/domain/presets";
import type {
  GroupActions,
  GroupCommitment,
  GroupDate,
  GroupHabitChoice,
  GroupLoaded,
  GroupResult,
  GroupWallCursor,
} from "@/lib/groups-contract";
import { GROUP_GENERIC_COPY, groupErrorCopy } from "@/lib/groups-copy";
import { WALL_PAGE_SIZE, loadGroupWall, loadGroupWeek, loadInvitePreview } from "@/lib/groups-data";
import * as rpc from "@/lib/groups-rpc";
import type { GroupsClient, RpcAnswer } from "@/lib/groups-rpc";
import { requireUser } from "@/lib/require-user";
import { siteOrigin } from "@/lib/site-url";

/**
 * Server actions of Grupos (one per member of `GroupActions`). Every action: requireUser() first, then server-side
 * validation of every argument, then the RPC with the caller's own session (never the service role), then the database's
 * error codes mapped to Spanish copy. Raw database text is never returned or logged.
 */

const NOT_FOUND = "No encontramos ese grupo.";
const LINK_GONE = "Este enlace ya no sirve. Pide uno nuevo.";

const fail = (error: string) => ({ ok: false as const, error });

type Authed = Extract<Awaited<ReturnType<typeof requireUser>>, { ok: true }>;

// shared: entering a group with a habit -------------------------------------------------------------------------------

/** The habit "Crear «<compromiso>»" makes: the commitment's name, icon, frequency and photo rule; visible to friends like any shared habit. */
function habitDraftFromCommitment(c: GroupCommitment, color: string): HabitDraft {
  return {
    name: c.name,
    icon: c.icon as IconKey,
    frequency: c.targetPerWeek === 7 ? { type: "daily" } : { type: "weekly", target: c.targetPerWeek },
    requiresPhoto: c.requiresPhoto,
    items: [],
    visibility: "friends",
    preset: null,
    color: toHabitColor(color),
    logType: "none",
    quantity: null,
  };
}

/**
 * Links the person to a group with a habit: their own (`kind: "habit"`, the RPC alone) or a new one built from the commitment
 * (`kind: "create"`: habit first, then the RPC, exactly like accepting a challenge). Not atomic by design. When the RPC fails
 * after this call created the habit, the outcome is re-read BEFORE judging (the response may be lost while the write committed):
 * a membership that links that very habit is a success; otherwise only the habit this call created is removed, scoped by its
 * id and the caller's id. A habit the person chose is never touched.
 */
async function enter(
  auth: Authed,
  choice: GroupHabitChoice,
  commitment: GroupCommitment,
  color: string,
  link: (habitId: string) => Promise<RpcAnswer<string>>,
): Promise<GroupResult<{ id: string }>> {
  const { supabase, userId } = auth;

  if (choice.kind === "habit") {
    try {
      const r = await link(choice.habitId);
      if (r.error) return fail(groupErrorCopy(r.error.message));
      return isUuid(r.data) ? { ok: true, data: { id: r.data } } : fail(GROUP_GENERIC_COPY);
    } catch {
      return fail(GROUP_GENERIC_COPY);
    }
  }

  const draft = habitDraftFromCommitment(commitment, color);
  let created: Awaited<ReturnType<typeof createHabit>>;
  try {
    created = await createHabit(draft);
  } catch {
    return fail(GROUP_GENERIC_COPY);
  }
  if (!created.ok) return fail(created.error);

  // an exception is an unknown outcome: it takes the same re-read and clean-up decision as an error answer
  let reason = GROUP_GENERIC_COPY;
  try {
    const r = await link(created.id);
    if (!r.error && isUuid(r.data)) return { ok: true, data: { id: r.data } };
    if (r.error) reason = groupErrorCopy(r.error.message);
  } catch {
    // keep the generic reason
  }
  const name = draft.name.trim();

  // the response may be lost while the write committed: ask the caller's own groups before judging
  let again: Awaited<ReturnType<typeof rpc.myGroups>> | null = null;
  try {
    again = await rpc.myGroups(supabase);
  } catch {
    again = null;
  }
  if (!again || again.error || !Array.isArray(again.data)) {
    return fail(`No pudimos confirmar el grupo. Creamos «${name}» en tus hábitos; revisa Grupos antes de reintentar.`);
  }
  const linked = again.data.find((g) => g && g.my_habit_id === created.id && isUuid(g.id));
  if (linked) return { ok: true, data: { id: linked.id } };

  // only the habit created above, only while it is still the caller's: never anything else
  let removedOk = false;
  try {
    const { data: removed, error: removeError } = await supabase
      .from("habits")
      .delete()
      .eq("id", created.id)
      .eq("user_id", userId)
      .select("id");
    removedOk = !removeError && !!removed && removed.length > 0;
  } catch {
    removedOk = false;
  }
  revalidatePath("/");
  if (!removedOk) return fail(`${reason} Creamos «${name}» en tus hábitos; puedes archivarlo.`);
  return fail(reason);
}

// actions ---------------------------------------------------------------------------------------------------------------

export async function create(draft: Parameters<GroupActions["create"]>[0]): ReturnType<GroupActions["create"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  const valid = validateGroupDraft(draft);
  if (!valid.ok) return valid;
  const d = valid.draft;

  const made = await enter(auth, d.habit, d.commitment, d.color, (habitId) =>
    rpc.createGroup(auth.supabase, {
      name: d.name,
      icon: d.icon,
      color: d.color,
      description: d.description === "" ? null : d.description,
      commitmentName: d.commitment.name,
      commitmentIcon: d.commitment.icon,
      targetPerWeek: d.commitment.targetPerWeek,
      requiresPhoto: d.commitment.requiresPhoto,
      habitId,
    }),
  );
  if (!made.ok) return made;
  // a new habit was created through createHabit, which already revalidated Hoy; linking one of theirs changes Hoy here
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${made.data.id}`);
  if (d.habit.kind === "habit") revalidatePath("/");
  return made;
}

export async function update(
  groupId: string,
  fields: Parameters<GroupActions["update"]>[1],
): ReturnType<GroupActions["update"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  const valid = validateGroupFields(fields);
  if (!valid.ok) return valid;
  const f = valid.fields;
  const { error } = await rpc.updateGroup(auth.supabase, groupId, {
    name: f.name,
    icon: f.icon,
    color: f.color,
    description: f.description === "" ? null : f.description,
  });
  if (error) return fail(groupErrorCopy(error.message));
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${groupId}`);
  revalidatePath("/"); // the Hoy chip shows the group's name
  return { ok: true, data: undefined };
}

export async function setCommitment(
  groupId: string,
  commitment: GroupCommitment,
): ReturnType<GroupActions["setCommitment"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  const valid = validateCommitment(commitment);
  if (!valid.ok) return valid;
  const { data, error } = await rpc.setGroupCommitment(auth.supabase, groupId, valid.commitment);
  if (error) return fail(groupErrorCopy(error.message));
  if (!isLocalDate(data)) return fail(GROUP_GENERIC_COPY);
  revalidatePath(`/grupos/${groupId}`);
  return { ok: true, data: { effectiveFrom: data as GroupDate } };
}

export async function archive(groupId: string): ReturnType<GroupActions["archive"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  const { error } = await rpc.archiveGroup(auth.supabase, groupId);
  if (error) return fail(groupErrorCopy(error.message));
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${groupId}`);
  revalidatePath("/"); // an archived group's chip leaves Hoy
  return { ok: true, data: undefined };
}

export async function createInvite(groupId: string): ReturnType<GroupActions["createInvite"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  const { data, error } = await rpc.createGroupInvite(auth.supabase, groupId);
  if (error) return fail(groupErrorCopy(error.message));
  // the code goes into a URL: only a code of the expected shape is ever used
  if (!isInviteCodeShape(data)) return fail(GROUP_GENERIC_COPY);
  return { ok: true, data: { code: data, url: `${siteOrigin(await headers())}/grupos/unirse/${data}` } };
}

export async function join(
  code: string,
  habit: GroupHabitChoice,
): ReturnType<GroupActions["join"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isInviteCodeShape(code)) return fail(LINK_GONE);
  const choice = validateHabitChoice(habit);
  if (!choice.ok) return choice;

  // "Crear" copies the commitment of the group, which only the invitation preview shows a non-member: read it, never trust the client
  let commitment: GroupCommitment = { name: "", icon: "target", targetPerWeek: 1, requiresPhoto: false };
  let color = "indigo";
  if (choice.habit.kind === "create") {
    const preview = await loadInvitePreview(code, auth.supabase);
    if (!preview.ok) return fail(preview.error);
    if (preview.data === null) return fail(LINK_GONE);
    if (preview.data.full) return fail(groupErrorCopy("group_full"));
    commitment = preview.data.commitment;
    color = preview.data.color;
  }

  const joined = await enter(auth, choice.habit, commitment, color, (habitId) => rpc.joinGroup(auth.supabase, code, habitId));
  if (!joined.ok) return joined;
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${joined.data.id}`);
  if (choice.habit.kind === "habit") revalidatePath("/");
  return joined;
}

export async function leave(groupId: string): ReturnType<GroupActions["leave"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  const { error } = await rpc.leaveGroup(auth.supabase, groupId);
  if (error) return fail(groupErrorCopy(error.message));
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${groupId}`);
  revalidatePath("/"); // the habit is unlinked: its group chip leaves Hoy
  return { ok: true, data: undefined };
}

export async function removeMember(groupId: string, userId: string): ReturnType<GroupActions["removeMember"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  if (!isUuid(userId)) return fail(GROUP_GENERIC_COPY);
  if (userId === auth.userId) return fail(groupErrorCopy("cannot_remove_self"));
  const { error } = await rpc.removeGroupMember(auth.supabase, groupId, userId);
  if (error) return fail(groupErrorCopy(error.message));
  revalidatePath("/grupos"); // the member count on the card
  revalidatePath(`/grupos/${groupId}`);
  return { ok: true, data: undefined };
}

export async function setAdmin(groupId: string, userId: string, admin: boolean): ReturnType<GroupActions["setAdmin"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  if (!isUuid(userId) || typeof admin !== "boolean") return fail(GROUP_GENERIC_COPY);
  const { error } = await rpc.setGroupAdmin(auth.supabase, groupId, userId, admin);
  if (error) return fail(groupErrorCopy(error.message));
  revalidatePath(`/grupos/${groupId}`);
  return { ok: true, data: undefined };
}

function toResult<T>(loaded: GroupLoaded<T>): GroupResult<T> {
  return loaded.ok ? loaded : fail(loaded.error);
}

export async function loadMoreWall(groupId: string, cursor: GroupWallCursor): ReturnType<GroupActions["loadMoreWall"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  const c = cursor as Partial<GroupWallCursor> | null;
  if (!c || typeof c.before !== "string" || c.before.length > 64 || Number.isNaN(Date.parse(c.before)) || !isUuid(c.beforeId)) {
    return fail(INVALID_GROUP_COPY);
  }
  return toResult(await loadGroupWall(groupId, { before: c.before, beforeId: c.beforeId }, WALL_PAGE_SIZE, auth.supabase as GroupsClient));
}

export async function loadWeek(groupId: string, weekStart: GroupDate): ReturnType<GroupActions["loadWeek"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  if (!isLocalDate(weekStart)) return fail(INVALID_GROUP_COPY);
  return toResult(await loadGroupWeek(groupId, weekStart, auth.supabase as GroupsClient));
}

// compile-time proof that the named exports satisfy GroupActions exactly (a "use server" file cannot export an object)
const groupActionsCheck = {
  create,
  update,
  setCommitment,
  archive,
  createInvite,
  join,
  leave,
  removeMember,
  setAdmin,
  loadMoreWall,
  loadWeek,
} satisfies GroupActions;
void groupActionsCheck;
