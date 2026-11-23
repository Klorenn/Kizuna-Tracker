/**
 * Pure helpers of the group detail views (no React, no I/O): board order and compliance, wall
 * paging, clipboard, the single-flight action runner, local validation and labels.
 */
import { addDays } from "@/domain/dates";
import { HABIT_ICONS, type IconKey } from "@/domain/presets";
import { dayMonthLabel } from "@/lib/challenge-view";
import { feedDayLabel } from "@/lib/feed";
import { CONNECTION_ERROR, safeAction } from "@/lib/safe-action";
import {
  GROUP_LIMITS,
  type GroupBoardRow,
  type GroupDetail,
  type GroupRole,
  type GroupCommitment,
  type GroupDate,
  type GroupResult,
  type GroupWallCursor,
  type GroupWallItem,
  type GroupWallPage,
} from "@/lib/groups-contract";

/* ---------------------------------- board ---------------------------------- */

/** A counted member whose week is done. */
export const isComplied = (r: Pick<GroupBoardRow, "counts" | "done" | "target">): boolean =>
  r.counts && r.done >= r.target;

/** "Cumplen N de M": M counts only the members whose week already counts. */
export function complianceOf(rows: readonly GroupBoardRow[]): { complied: number; counted: number } {
  let complied = 0;
  let counted = 0;
  for (const r of rows) {
    if (!r.counts) continue;
    counted += 1;
    if (isComplied(r)) complied += 1;
  }
  return { complied, counted };
}

const progress = (r: GroupBoardRow) => (r.target > 0 ? Math.min(r.done, r.target) / r.target : 0);

/** Progress first (done over target), then name. Members who start next Monday go last. */
export function sortBoard(rows: readonly GroupBoardRow[]): GroupBoardRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.counts) - Number(a.counts) ||
      progress(b) - progress(a) ||
      b.done - a.done ||
      a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" }) ||
      a.userId.localeCompare(b.userId),
  );
}

/* ----------------------------------- wall ----------------------------------- */

export type WallState = { pages: GroupWallItem[][]; next: GroupWallCursor | null; error: string | null };

export const initialWall = (page: GroupWallPage): WallState => ({
  pages: page.items.length > 0 ? [page.items] : [],
  next: page.next,
  error: null,
});

/** Appends a page, dropping check-ins already on screen (by `checkinId`); a page with nothing new adds no chunk. */
export function appendWallPage(state: WallState, page: GroupWallPage): WallState {
  const seen = new Set(state.pages.flatMap((p) => p.map((i) => i.checkinId)));
  const fresh = page.items.filter((i) => !seen.has(i.checkinId));
  return { pages: fresh.length > 0 ? [...state.pages, fresh] : state.pages, next: page.next, error: null };
}

/* -------------------------------- clipboard -------------------------------- */

export type CopyOutcome = "copied" | "unavailable";

/** Copies a link; a missing, blocked or throwing clipboard is "unavailable", never an exception. */
export async function copyLink(
  url: string,
  clipboard: { writeText: (text: string) => Promise<void> } | undefined,
): Promise<CopyOutcome> {
  if (!clipboard) return "unavailable";
  try {
    await clipboard.writeText(url);
    return "copied";
  } catch {
    return "unavailable";
  }
}

/* --------------------------------- actions --------------------------------- */

/**
 * Single-flight runner: a second call while one is running is ignored (`null`), so a double tap
 * cannot submit twice even before React re-renders the disabled button. A thrown action (network)
 * becomes an error result; Next's control-flow errors are rethrown by `safeAction`.
 */
export function createRunner() {
  let busy = false;
  return {
    busy: () => busy,
    async run<T>(fn: () => Promise<GroupResult<T>>): Promise<GroupResult<T> | null> {
      if (busy) return null;
      busy = true;
      try {
        const r = await safeAction(fn);
        return r.ok ? r.value : { ok: false, error: r.error || CONNECTION_ERROR };
      } finally {
        busy = false;
      }
    },
  };
}

/* ------------------------------ validation, labels ------------------------------ */

export type GroupEditFields = { name: string; icon: string; color: string; description: string };

export function validateEdit(f: GroupEditFields): string | null {
  const name = f.name.trim();
  if (name.length < GROUP_LIMITS.nameMin || name.length > GROUP_LIMITS.nameMax)
    return `El nombre debe tener entre ${GROUP_LIMITS.nameMin} y ${GROUP_LIMITS.nameMax} letras.`;
  if (f.description.trim().length > GROUP_LIMITS.descriptionMax)
    return `La descripción puede tener hasta ${GROUP_LIMITS.descriptionMax} caracteres.`;
  return null;
}

export function validateCommitment(c: GroupCommitment): string | null {
  const name = c.name.trim();
  if (name.length === 0) return "Escribe el compromiso del grupo.";
  if (name.length > GROUP_LIMITS.commitmentMax)
    return `El compromiso puede tener hasta ${GROUP_LIMITS.commitmentMax} caracteres.`;
  if (!Number.isInteger(c.targetPerWeek) || c.targetPerWeek < GROUP_LIMITS.targetMin || c.targetPerWeek > GROUP_LIMITS.targetMax)
    return `Elige entre ${GROUP_LIMITS.targetMin} y ${GROUP_LIMITS.targetMax} veces por semana.`;
  return null;
}

/** "16 nov al 22 nov": a closed week, Monday to Sunday. */
export function weekRange(weekStart: GroupDate): string {
  return `${dayMonthLabel(weekStart)} al ${dayMonthLabel(addDays(weekStart, 6))}`;
}

/** "Jue 31 dic": a day label that never says "Hoy" or "Ayer" (used until the viewer's date is known). */
export function plainDayLabel(date: GroupDate): string {
  // a reference day in the same year and never adjacent to `date`, so no relative word and no year suffix
  const y = date.slice(0, 4);
  return feedDayLabel(date, date.slice(5, 7) === "06" ? `${y}-01-01` : `${y}-06-15`);
}

export function isIconKey(value: string): value is IconKey {
  return (HABIT_ICONS as readonly string[]).includes(value);
}

/** The contract carries icons as strings: anything unknown renders as the people icon. */
export const iconKeyOf = (value: string): IconKey => (isIconKey(value) ? value : "users");

/* ---------------------- what the server accepted, shown at once ---------------------- */

/**
 * The view keeps what an admin just changed (edit, commitment, archive, removal, role) on top of
 * the props, so the screen is right before the page is refreshed. A new `detail` or `board` from
 * the page replaces it.
 */
export type Overlay = {
  fields?: GroupEditFields;
  pending?: GroupDetail["pendingCommitment"];
  archived: boolean;
  removed: string[];
  roles: Record<string, GroupRole>;
};

export const EMPTY_OVERLAY: Overlay = { archived: false, removed: [], roles: {} };

export function applyDetail(detail: GroupDetail, o: Overlay): GroupDetail {
  if (o === EMPTY_OVERLAY) return detail;
  return {
    ...detail,
    ...(o.fields ? { ...o.fields, description: o.fields.description.trim() || null } : {}),
    ...(o.pending !== undefined ? { pendingCommitment: o.pending } : {}),
    archived: detail.archived || o.archived,
    memberCount: Math.max(0, detail.memberCount - o.removed.length),
  };
}

export function applyMembers(rows: GroupBoardRow[] | null, o: Overlay): GroupBoardRow[] | null {
  if (!rows || o === EMPTY_OVERLAY) return rows;
  if (o.removed.length === 0 && Object.keys(o.roles).length === 0) return rows;
  return rows
    .filter((r) => !o.removed.includes(r.userId))
    .map((r) => (o.roles[r.userId] && o.roles[r.userId] !== r.role ? { ...r, role: o.roles[r.userId] } : r));
}
