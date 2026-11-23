import { isInviteCodeShape, isLocalDate, isUuid } from '@/domain/groups'
import type {
  GroupBoardRow,
  GroupCommitment,
  GroupDetail,
  GroupInvitePreview,
  GroupLoaded,
  GroupPerson,
  GroupRole,
  GroupSummary,
  GroupWallCursor,
  GroupWallItem,
  GroupWallPage,
  GroupWeek,
  GroupWeekRow,
} from '@/lib/groups-contract'
import { GROUP_LOAD_COPY, GROUP_SIGN_IN_COPY, groupErrorCode, isNotFoundCode } from '@/lib/groups-copy'
import * as rpc from '@/lib/groups-rpc'
import type { GroupsClient, RpcAnswer } from '@/lib/groups-rpc'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Loaders: server-side reads over the Grupos RPCs (through `groups-rpc`), mapped to the contract types.
 * A failed call, a thrown call or a row that does not have the expected shape is an error state, never an
 * empty list. `group_not_found` / `not_group_member` are the not-found state (`notFound: true`).
 * Every loader takes an optional client (a server action that already checked the session passes its own).
 */

export const WALL_PAGE_SIZE = 20
/** The database clamps `p_limit` to 50 and a page asks for one extra row to know whether there is more. */
const WALL_MAX_PAGE = 49
export const HISTORY_DEFAULT = 12

const NOT_FOUND_COPY = 'No encontramos ese grupo.'
const COPY = {
  groups: GROUP_LOAD_COPY,
  group: 'No pudimos cargar el grupo. Inténtalo de nuevo.',
  board: 'No pudimos cargar el tablero. Inténtalo de nuevo.',
  wall: 'No pudimos cargar el muro. Inténtalo de nuevo.',
  history: 'No pudimos cargar las semanas anteriores. Inténtalo de nuevo.',
  week: 'No pudimos cargar esa semana. Inténtalo de nuevo.',
  invite: 'No pudimos cargar la invitación. Inténtalo de nuevo.',
} as const

const notFound = (): { ok: false; error: string; notFound: true } => ({ ok: false, error: NOT_FOUND_COPY, notFound: true })

// strict readers: a field of the wrong type means the answer cannot be trusted ----------------------------------------

class Malformed extends Error {}
class Missing extends Error {}

type Row = Record<string, unknown>

function row(v: unknown): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Malformed('row')
  return v as Row
}
function str(o: Row, k: string): string {
  const v = o[k]
  if (typeof v !== 'string') throw new Malformed(k)
  return v
}
function strOrNull(o: Row, k: string): string | null {
  const v = o[k]
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') throw new Malformed(k)
  return v
}
function num(o: Row, k: string): number {
  const v = o[k]
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Malformed(k)
  return v
}
function numOrNull(o: Row, k: string): number | null {
  const v = o[k]
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Malformed(k)
  return v
}
function bool(o: Row, k: string): boolean {
  const v = o[k]
  if (typeof v !== 'boolean') throw new Malformed(k)
  return v
}
function boolOrNull(o: Row, k: string): boolean | null {
  const v = o[k]
  if (v === null || v === undefined) return null
  if (typeof v !== 'boolean') throw new Malformed(k)
  return v
}
function role(o: Row, k: string): GroupRole {
  const v = o[k]
  if (v !== 'admin' && v !== 'member') throw new Malformed(k)
  return v
}
function list(v: unknown): Row[] {
  if (!Array.isArray(v)) throw new Malformed('list')
  return v.map(row)
}

function commitmentOf(o: Row): GroupCommitment {
  return {
    name: str(o, 'commitment_name'),
    icon: str(o, 'commitment_icon'),
    targetPerWeek: num(o, 'target_per_week'),
    requiresPhoto: bool(o, 'requires_photo'),
  }
}

function personOf(o: Row): GroupPerson {
  return {
    userId: str(o, 'user_id'),
    username: str(o, 'username'),
    displayName: str(o, 'display_name'),
    avatarPath: strOrNull(o, 'avatar_path'),
    avatarPreset: numOrNull(o, 'avatar_preset'),
  }
}

// the shared runner ----------------------------------------------------------------------------------------------------

async function run<T>(
  client: GroupsClient | undefined,
  errorCopy: string,
  call: (c: GroupsClient) => Promise<RpcAnswer<unknown>>,
  map: (data: unknown) => T,
): Promise<GroupLoaded<T>> {
  try {
    const c = client ?? (await createServerClient())
    const { data, error } = await call(c)
    if (error) {
      const code = groupErrorCode(error.message)
      if (isNotFoundCode(code)) return notFound()
      if (code === 'not_authenticated') return { ok: false, error: GROUP_SIGN_IN_COPY }
      return { ok: false, error: errorCopy }
    }
    return { ok: true, data: map(data) }
  } catch (e) {
    if (e instanceof Missing) return notFound()
    return { ok: false, error: errorCopy }
  }
}

// loaders --------------------------------------------------------------------------------------------------------------

/** The caller's groups (`my_groups`): `GroupSummary[]`, one per group the caller belongs to; archived ones included with `archived: true`. */
export function loadMyGroups(client?: GroupsClient): Promise<GroupLoaded<GroupSummary[]>> {
  return run(client, COPY.groups, (c) => rpc.myGroups(c), (data) =>
    list(data).map(
      (o): GroupSummary => ({
        id: str(o, 'id'),
        name: str(o, 'name'),
        icon: str(o, 'icon'),
        color: str(o, 'color'),
        role: role(o, 'role'),
        memberCount: num(o, 'member_count'),
        commitment: commitmentOf(o),
        myHabitId: str(o, 'my_habit_id'),
        myDone: num(o, 'my_done'),
        myCounts: bool(o, 'my_counts'),
        compliedCount: num(o, 'complied_count'),
        countedCount: num(o, 'counted_count'),
        streak: num(o, 'streak'),
        archived: bool(o, 'archived'),
      }),
    ),
  )
}

/** One group (`group_detail`): `GroupDetail`, with `pendingCommitment` null unless an admin scheduled a change. `notFound` for a stranger. */
export function loadGroupDetail(groupId: string, client?: GroupsClient): Promise<GroupLoaded<GroupDetail>> {
  if (!isUuid(groupId)) return Promise.resolve(notFound())
  return run(client, COPY.group, (c) => rpc.groupDetail(c, groupId), (data) => {
    const rows = Array.isArray(data) ? data : data == null ? [] : [data]
    if (rows.length === 0) throw new Missing()
    const o = row(rows[0])
    const nextName = strOrNull(o, 'next_commitment_name')
    const nextFrom = strOrNull(o, 'next_effective_from')
    let pending: GroupDetail['pendingCommitment'] = null
    if (nextName !== null || nextFrom !== null) {
      const icon = strOrNull(o, 'next_commitment_icon')
      const target = numOrNull(o, 'next_target_per_week')
      const photo = boolOrNull(o, 'next_requires_photo')
      // a pending change is all-or-nothing: a half-filled one cannot be trusted
      if (nextName === null || nextFrom === null || icon === null || target === null || photo === null) throw new Malformed('next')
      pending = { name: nextName, icon, targetPerWeek: target, requiresPhoto: photo, effectiveFrom: nextFrom }
    }
    return {
      id: str(o, 'id'),
      name: str(o, 'name'),
      icon: str(o, 'icon'),
      color: str(o, 'color'),
      description: strOrNull(o, 'description'),
      commitment: commitmentOf(o),
      pendingCommitment: pending,
      role: role(o, o.my_role !== undefined ? 'my_role' : 'role'),
      myHabitId: str(o, 'my_habit_id'),
      streak: num(o, 'streak'),
      memberCount: num(o, 'member_count'),
      archived: o.archived === undefined ? false : bool(o, 'archived'),
    }
  })
}

/** The week's board (`group_board`): `GroupBoardRow[]`, one per active member, in the order the database returns (the view sorts). */
export function loadGroupBoard(groupId: string, client?: GroupsClient): Promise<GroupLoaded<GroupBoardRow[]>> {
  if (!isUuid(groupId)) return Promise.resolve(notFound())
  return run(client, COPY.board, (c) => rpc.groupBoard(c, groupId), (data) =>
    list(data).map(
      (o): GroupBoardRow => ({
        ...personOf(o),
        role: role(o, 'role'),
        joinedOn: str(o, 'joined_on'),
        counts: bool(o, 'counts'),
        done: num(o, 'done'),
        target: num(o, 'target'),
      }),
    ),
  )
}

/**
 * One page of the wall (`group_wall`), newest first: `GroupWallPage` = `{ items, next }`. `next` is the cursor for the following
 * page, or null when this was the last. Pass the `next` of the previous page as `cursor`. Default page size 20 (at most 49).
 */
export function loadGroupWall(
  groupId: string,
  cursor: GroupWallCursor | null = null,
  pageSize: number = WALL_PAGE_SIZE,
  client?: GroupsClient,
): Promise<GroupLoaded<GroupWallPage>> {
  if (!isUuid(groupId)) return Promise.resolve(notFound())
  const size = Math.min(WALL_MAX_PAGE, Math.max(1, Math.trunc(Number.isFinite(pageSize) ? pageSize : WALL_PAGE_SIZE)))
  return run(client, COPY.wall, (c) => rpc.groupWall(c, groupId, cursor, size + 1), (data) => {
    const rows = list(data)
    const items = rows.slice(0, size).map(
      (o): GroupWallItem => ({
        ...personOf(o),
        checkinId: str(o, 'checkin_id'),
        localDate: str(o, 'local_date'),
        photoPath: strOrNull(o, 'photo_path'),
        createdAt: str(o, 'created_at'),
      }),
    )
    const last = items[items.length - 1]
    return { items, next: rows.length > size && last ? { before: last.createdAt, beforeId: last.checkinId } : null }
  })
}

/** Closed weeks (`group_history`), newest first: `GroupWeek[]` (default the last 12). `myComplied` is null when the caller was not counted. */
export function loadGroupHistory(
  groupId: string,
  limit: number = HISTORY_DEFAULT,
  client?: GroupsClient,
): Promise<GroupLoaded<GroupWeek[]>> {
  if (!isUuid(groupId)) return Promise.resolve(notFound())
  return run(client, COPY.history, (c) => rpc.groupHistory(c, groupId, limit), (data) =>
    list(data).map(
      (o): GroupWeek => ({
        weekStart: str(o, 'week_start'),
        targetPerWeek: num(o, 'target_per_week'),
        requiresPhoto: bool(o, 'requires_photo'),
        membersCounted: num(o, 'members_counted'),
        membersComplied: num(o, 'members_complied'),
        myComplied: boolOrNull(o, 'my_complied'),
      }),
    ),
  )
}

/** Who complied in one closed week (`group_week_detail`): `GroupWeekRow[]`. A `weekStart` that is not a real date is refused without a call. */
export function loadGroupWeek(
  groupId: string,
  weekStart: string,
  client?: GroupsClient,
): Promise<GroupLoaded<GroupWeekRow[]>> {
  if (!isUuid(groupId)) return Promise.resolve(notFound())
  if (!isLocalDate(weekStart)) return Promise.resolve({ ok: false, error: COPY.week })
  return run(client, COPY.week, (c) => rpc.groupWeekDetail(c, groupId, weekStart), (data) =>
    list(data).map(
      (o): GroupWeekRow => ({ ...personOf(o), done: num(o, 'done'), target: num(o, 'target'), complied: bool(o, 'complied') }),
    ),
  )
}

/**
 * The public preview of an invitation (`group_invite_preview`, callable signed out): `GroupInvitePreview`, or `data: null` when the
 * link no longer works (unknown, expired, used up, archived group, or a code with an impossible shape: no call is made then).
 * `ok: false` only when the read itself failed.
 */
export function loadInvitePreview(code: string, client?: GroupsClient): Promise<GroupLoaded<GroupInvitePreview | null>> {
  if (!isInviteCodeShape(code)) return Promise.resolve({ ok: true, data: null })
  return run(client, COPY.invite, (c) => rpc.groupInvitePreview(c, code), (data) => {
    if (data === null || data === undefined) return null
    const o = row(data)
    return {
      name: str(o, 'name'),
      icon: str(o, 'icon'),
      color: str(o, 'color'),
      commitment: commitmentOf(o),
      memberCount: num(o, 'member_count'),
      full: bool(o, 'full'),
    }
  })
}
