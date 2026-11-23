/** Pure helpers of the photo rejection views: who may reject a photo and the reason's validation. */
import type { GroupRole } from "@/lib/groups-contract";
import { FINE_LIMITS } from "@/lib/groups-fines-contract";

const WINDOW_MS = FINE_LIMITS.rejectHours * 3600_000;

/**
 * The reject button appears only for admins of a live group, on another person's photo, less than
 * 24 hours old, when the commitment requires a photo. An unreadable date is a no.
 */
export function canRejectPhoto(a: {
  role: GroupRole;
  archived: boolean;
  requiresPhoto: boolean;
  hasPhoto: boolean;
  ownerId: string;
  myUserId: string;
  createdAt: string;
  now: number;
}): boolean {
  if (a.role !== "admin" || a.archived || !a.requiresPhoto || !a.hasPhoto) return false;
  if (a.ownerId === a.myUserId) return false;
  const created = Date.parse(a.createdAt);
  return Number.isFinite(created) && a.now - created < WINDOW_MS;
}

export function prepareReason(text: string): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = text.trim();
  if (reason.length === 0 || reason.length > FINE_LIMITS.reasonMax)
    return { ok: false, error: "Escribe un motivo de hasta 140 letras." };
  return { ok: true, reason };
}
