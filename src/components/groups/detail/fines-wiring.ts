/** Pure decisions of the group page for the optional fine: who gets the Fondo section, what reaches the reject button. */
import type { GroupRole, GroupWallItem } from "@/lib/groups-contract";
import type { GroupFineActions, GroupFineState, GroupFund, GroupRejectedItem } from "@/lib/groups-fines-contract";
import { runAndNotify } from "../fund/fund-logic";
import type { createRunner } from "./group-logic";

export type GroupSection = "board" | "wall" | "members" | "fund";

/**
 * Admins always get "Fondo" (it is where "Proponer multa" lives). A plain member gets it when there is a fine in force, a
 * proposal open, or any debt registered. A read that failed is not "nothing": the section shows its own error state.
 */
export function showFundSection(a: {
  role: GroupRole;
  archived: boolean;
  state: GroupFineState | null;
  fund: GroupFund | null;
}): boolean {
  if (a.role === "admin") return true;
  if (a.state === null || a.fund === null) return true;
  return Boolean(a.state.active) || Boolean(a.state.proposal) || a.fund.totals.registered > 0 || a.fund.debts.length > 0;
}

/** `?seccion=` of a notification or of the join: "fondo" and "muro" open that section; anything else is the board. */
export function initialSection(param: string | string[] | undefined, fundShown: boolean): GroupSection {
  if (param === "muro") return "wall";
  if (param === "fondo" && fundShown) return "fund";
  return "board";
}

export type RejectContext = {
  groupId: string;
  myUserId: string;
  role: GroupRole;
  archived: boolean;
  requiresPhoto: boolean;
  now: number;
};

/** The real values for `RejectPhotoButton`; the component and `canRejectPhoto` decide whether it shows. */
export function rejectButtonProps(item: GroupWallItem, c: RejectContext) {
  return {
    groupId: c.groupId,
    checkinId: item.checkinId,
    ownerId: item.userId,
    ownerName: item.displayName,
    myUserId: c.myUserId,
    role: c.role,
    archived: c.archived,
    requiresPhoto: c.requiresPhoto,
    hasPhoto: item.photoPath !== null,
    createdAt: item.createdAt,
    now: c.now,
  };
}

/**
 * The rejected list is for admins of a group that asks for photos (or where something was rejected), and for a member the
 * read gave something to (their own rejected photos: the reason is for them). A failed read still shows its error state;
 * an empty list never shows an empty card.
 */
export function showRejectedList(a: { role: GroupRole; items: GroupRejectedItem[] | null; requiresPhoto: boolean }): boolean {
  if (a.items === null) return true;
  if (a.items.length > 0) return true;
  return a.role === "admin" && a.requiresPhoto;
}

/** `?unido=` of the join: only the literal "1" counts. */
export function isJustJoined(param: string | string[] | undefined): boolean {
  return param === "1";
}

/** The question after joining: a fine in force or approved, not ending, and the person is not bound. */
export function joinQuestionVisible(a: { justJoined: boolean; state: GroupFineState | null }): boolean {
  const f = a.state?.active;
  return a.justJoined && Boolean(f) && !f?.iAmBound && f?.endsOn === null;
}

export type JoinAnswer = { kind: "closed" } | { kind: "error"; error: string } | { kind: "busy" };

/** "Aceptar multa" calls `acceptActive`; "Ahora no" only closes the card and binds nothing. An error keeps the card. */
export async function answerJoinQuestion(a: {
  accept: boolean;
  groupId: string;
  acceptActive: GroupFineActions["acceptActive"];
  runner: ReturnType<typeof createRunner>;
}): Promise<JoinAnswer> {
  if (!a.accept) return { kind: "closed" };
  const r = await runAndNotify(a.runner, () => a.acceptActive(a.groupId));
  if (r === null) return { kind: "busy" };
  return r.ok ? { kind: "closed" } : { kind: "error", error: r.error };
}
