/** Pure decisions of the group page for the optional fine: who gets the Fondo section, what reaches the reject button. */
import type { GroupRole, GroupWallItem } from "@/lib/groups-contract";
import type { GroupFineState, GroupFund, GroupRejectedItem } from "@/lib/groups-fines-contract";

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
 * The rejected list is for admins, and for a member the read gave something to (their own rejected photos: the reason is
 * for them). A failed read still shows its error state.
 */
export function showRejectedList(a: { role: GroupRole; items: GroupRejectedItem[] | null }): boolean {
  return a.role === "admin" || a.items === null || a.items.length > 0;
}
