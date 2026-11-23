"use server";

import { revalidatePath } from "next/cache";
import { validateFineProposal, validateRejectReason } from "@/domain/group-fines";
import { isUuid } from "@/domain/groups";
import type { GroupResult } from "@/lib/groups-contract";
import { fineErrorCode, fineErrorCopy, GROUP_GENERIC_COPY, UNDO_OWN_CHECKIN_COPY } from "@/lib/groups-copy";
import type { GroupFineActions } from "@/lib/groups-fines-contract";
import * as rpc from "@/lib/groups-fines-rpc";
import type { RpcAnswer } from "@/lib/groups-rpc";
import { requireUser } from "@/lib/require-user";

/**
 * Server actions of the optional fine (one per member of `GroupFineActions`). Every action: requireUser() first, then
 * server-side validation of every argument, then the RPC with the caller's own session (never the service role), then the
 * database's error codes mapped to Spanish copy. Raw database text is never returned or logged, and nothing about a person
 * is logged. The rejection reason travels only in `rejectPhoto`.
 */

const NOT_FOUND = "No encontramos ese grupo.";
const FINE_GONE = "Esa votación ya terminó.";
const DEBT_NOT_FOUND = "No encontramos esa deuda.";
const CHECKIN_NOT_FOUND = "No encontramos ese registro.";

const fail = (error: string) => ({ ok: false as const, error });

/** Runs one RPC: the database's error code becomes its copy; an exception is the generic copy. `null` means it worked. */
async function attempt<T>(
  call: () => Promise<RpcAnswer<T>>,
  special: Record<string, string> = {},
): Promise<{ data: T | null } | { error: string }> {
  try {
    const { data, error } = await call();
    if (error) {
      const code = fineErrorCode(error.message);
      return { error: (code && special[code]) || fineErrorCopy(error.message) };
    }
    return { data };
  } catch {
    return { error: GROUP_GENERIC_COPY };
  }
}

/** Call sites pass distinct paths, so each is revalidated once. */
function revalidate(paths: { path: string; type?: "page" }[]): void {
  for (const p of paths) {
    if (p.type) revalidatePath(p.path, p.type);
    else revalidatePath(p.path);
  }
}

const groupPage = (groupId: string) => ({ path: `/grupos/${groupId}` });
/** The action only knows a fine or a debt, not its group: every open group page is refreshed. */
const anyGroupPage = { path: "/grupos/[id]", type: "page" as const };

// actions ---------------------------------------------------------------------------------------------------------------

export async function propose(groupId: string, amount: number, purpose: string): ReturnType<GroupFineActions["propose"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  const valid = validateFineProposal(amount, purpose);
  if (!valid.ok) return valid;
  const r = await attempt(() => rpc.proposeGroupFine(auth.supabase, groupId, valid.amount, valid.purpose));
  if ("error" in r) return fail(r.error);
  if (!isUuid(r.data)) return fail(GROUP_GENERIC_COPY);
  revalidate([groupPage(groupId)]);
  return { ok: true, data: { id: r.data } };
}

export async function vote(fineId: string, accept: boolean): ReturnType<GroupFineActions["vote"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(fineId)) return fail(FINE_GONE);
  if (typeof accept !== "boolean") return fail(GROUP_GENERIC_COPY);
  const r = await attempt(() => rpc.voteGroupFine(auth.supabase, fineId, accept));
  if ("error" in r) return fail(r.error);
  revalidate([anyGroupPage]); // the vote may have activated the fine
  return { ok: true, data: undefined };
}

/** The three actions on the group's own fine share one shape. */
async function onGroupFine(
  groupId: string,
  call: (supabase: Parameters<typeof rpc.acceptGroupFine>[0]) => Promise<RpcAnswer<unknown>>,
): Promise<GroupResult> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  const r = await attempt(() => call(auth.supabase));
  if ("error" in r) return fail(r.error);
  revalidate([groupPage(groupId)]);
  return { ok: true, data: undefined };
}

export async function acceptActive(groupId: string): ReturnType<GroupFineActions["acceptActive"]> {
  return onGroupFine(groupId, (c) => rpc.acceptGroupFine(c, groupId));
}

export async function stepOut(groupId: string): ReturnType<GroupFineActions["stepOut"]> {
  return onGroupFine(groupId, (c) => rpc.leaveGroupFine(c, groupId));
}

export async function end(groupId: string): ReturnType<GroupFineActions["end"]> {
  return onGroupFine(groupId, (c) => rpc.endGroupFine(c, groupId));
}

export async function setDebtPaid(debtId: string, paid: boolean): ReturnType<GroupFineActions["setDebtPaid"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(debtId)) return fail(DEBT_NOT_FOUND);
  if (typeof paid !== "boolean") return fail(GROUP_GENERIC_COPY);
  const r = await attempt(() => rpc.setGroupDebtPaid(auth.supabase, debtId, paid));
  if ("error" in r) return fail(r.error);
  revalidate([anyGroupPage, { path: "/deudas" }]); // the fund on the group page and the totals on Deudas
  return { ok: true, data: undefined };
}

export async function rejectPhoto(groupId: string, checkinId: string, reason: string): ReturnType<GroupFineActions["rejectPhoto"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  if (!isUuid(checkinId)) return fail(CHECKIN_NOT_FOUND);
  const valid = validateRejectReason(reason);
  if (!valid.ok) return valid;
  const r = await attempt(() => rpc.rejectGroupCheckin(auth.supabase, groupId, checkinId, valid.reason));
  if ("error" in r) return fail(r.error);
  revalidate([groupPage(groupId), { path: "/grupos" }]); // the list shows "cumplen N de M", which a rejection changes
  return { ok: true, data: undefined };
}

export async function undoRejectPhoto(groupId: string, checkinId: string): ReturnType<GroupFineActions["undoRejectPhoto"]> {
  const auth = await requireUser();
  if (!auth.ok) return fail(auth.error);
  if (!isUuid(groupId)) return fail(NOT_FOUND);
  if (!isUuid(checkinId)) return fail(CHECKIN_NOT_FOUND);
  const r = await attempt(() => rpc.undoGroupCheckinRejection(auth.supabase, groupId, checkinId), {
    own_checkin: UNDO_OWN_CHECKIN_COPY,
  });
  if ("error" in r) return fail(r.error);
  revalidate([groupPage(groupId), { path: "/grupos" }]);
  return { ok: true, data: undefined };
}

// compile-time proof that the named exports satisfy GroupFineActions exactly (a "use server" file cannot export an object)
const groupFineActionsCheck = {
  propose,
  vote,
  acceptActive,
  stepOut,
  end,
  setDebtPaid,
  rejectPhoto,
  undoRejectPhoto,
} satisfies GroupFineActions;
void groupFineActionsCheck;
