import type { GroupCommitment, GroupWallCursor } from '@/lib/groups-contract'

/**
 * The single seam over the Grupos RPCs (migration 0023). The generated Supabase types do not know these
 * functions yet, so the rows are typed by hand here and nothing else in the app calls `supabase.rpc` for
 * groups. When the generated types arrive, only this file changes.
 *
 * Every function returns the raw `{ data, error }` untouched: mapping rows and errors is the caller's job.
 */

export type RpcError = { message: string; code?: string; details?: string; hint?: string }
export type RpcAnswer<T> = { data: T | null; error: RpcError | null }

/** Any Supabase client (the caller's session, or the service role in the cron route only). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GroupsClient = { rpc: (...args: any[]) => unknown }

async function call<T>(client: GroupsClient, fn: string, args?: Record<string, unknown>): Promise<RpcAnswer<T>> {
  const rpc = client.rpc as (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcAnswer<T>>
  return args === undefined ? rpc.call(client, fn) : rpc.call(client, fn, args)
}

export type GroupRoleValue = 'admin' | 'member'

export type MyGroupRow = {
  id: string
  name: string
  icon: string
  color: string
  role: GroupRoleValue
  member_count: number
  commitment_name: string
  commitment_icon: string
  target_per_week: number
  requires_photo: boolean
  my_habit_id: string
  my_done: number
  my_counts: boolean
  complied_count: number
  counted_count: number
  streak: number
  archived: boolean
}

export type GroupDetailRow = {
  id: string
  name: string
  icon: string
  color: string
  description: string | null
  commitment_name: string
  commitment_icon: string
  target_per_week: number
  requires_photo: boolean
  next_commitment_name: string | null
  next_commitment_icon: string | null
  next_target_per_week: number | null
  next_requires_photo: boolean | null
  next_effective_from: string | null
  /** The brief says "my role"; the column name is not fixed, so the loader accepts `my_role` or `role`. */
  my_role?: GroupRoleValue
  role?: GroupRoleValue
  my_habit_id: string
  streak: number
  member_count: number
  archived?: boolean
}

type PersonColumns = {
  user_id: string
  username: string
  display_name: string
  avatar_path: string | null
  avatar_preset: number | null
}

export type GroupBoardDbRow = PersonColumns & {
  role: GroupRoleValue
  joined_on: string
  counts: boolean
  done: number
  target: number
}

export type GroupWallDbRow = PersonColumns & {
  checkin_id: string
  local_date: string
  photo_path: string | null
  created_at: string
}

export type GroupHistoryDbRow = {
  week_start: string
  target_per_week: number
  requires_photo: boolean
  members_counted: number
  members_complied: number
  my_complied: boolean | null
}

export type GroupWeekDetailDbRow = PersonColumns & { done: number; target: number; complied: boolean }

export type InvitePreviewDb = {
  name: string
  icon: string
  color: string
  commitment_name: string
  commitment_icon: string
  target_per_week: number
  requires_photo: boolean
  member_count: number
  full: boolean
}

export type CreateGroupArgs = {
  name: string
  icon: string
  color: string
  /** Null when the description is empty. */
  description: string | null
  commitmentName: string
  commitmentIcon: string
  targetPerWeek: number
  requiresPhoto: boolean
  habitId: string
}

export type GroupFieldsArgs = { name: string; icon: string; color: string; description: string | null }

// writes ---------------------------------------------------------------------------------------------------------------

export const createGroup = (c: GroupsClient, a: CreateGroupArgs) =>
  call<string>(c, 'create_group', {
    p_name: a.name,
    p_icon: a.icon,
    p_color: a.color,
    p_description: a.description,
    p_commitment_name: a.commitmentName,
    p_commitment_icon: a.commitmentIcon,
    p_target_per_week: a.targetPerWeek,
    p_requires_photo: a.requiresPhoto,
    p_habit_id: a.habitId,
  })

export const updateGroup = (c: GroupsClient, groupId: string, f: GroupFieldsArgs) =>
  call<null>(c, 'update_group', {
    p_group_id: groupId,
    p_name: f.name,
    p_icon: f.icon,
    p_color: f.color,
    p_description: f.description,
  })

/** Resolves the Monday the change takes effect (a "YYYY-MM-DD" string). */
export const setGroupCommitment = (c: GroupsClient, groupId: string, k: GroupCommitment) =>
  call<string>(c, 'set_group_commitment', {
    p_group_id: groupId,
    p_commitment_name: k.name,
    p_commitment_icon: k.icon,
    p_target_per_week: k.targetPerWeek,
    p_requires_photo: k.requiresPhoto,
  })

export const archiveGroup = (c: GroupsClient, groupId: string) => call<null>(c, 'archive_group', { p_group_id: groupId })

export const createGroupInvite = (c: GroupsClient, groupId: string) =>
  call<string>(c, 'create_group_invite', { p_group_id: groupId })

export const joinGroup = (c: GroupsClient, code: string, habitId: string) =>
  call<string>(c, 'join_group', { p_code: code, p_habit_id: habitId })

export const leaveGroup = (c: GroupsClient, groupId: string) => call<null>(c, 'leave_group', { p_group_id: groupId })

export const removeGroupMember = (c: GroupsClient, groupId: string, userId: string) =>
  call<null>(c, 'remove_group_member', { p_group_id: groupId, p_user_id: userId })

export const setGroupAdmin = (c: GroupsClient, groupId: string, userId: string, admin: boolean) =>
  call<null>(c, 'set_group_admin', { p_group_id: groupId, p_user_id: userId, p_admin: admin })

// reads ----------------------------------------------------------------------------------------------------------------

/** Callable by `anon` too. Null for an unknown, expired or used-up code, or an archived group. */
export const groupInvitePreview = (c: GroupsClient, code: string) =>
  call<InvitePreviewDb>(c, 'group_invite_preview', { p_code: code })

export const myGroups = (c: GroupsClient) => call<MyGroupRow[]>(c, 'my_groups')

/** The contract does not say whether `group_detail` returns one row or a one-element set: the loader accepts both. */
export const groupDetail = (c: GroupsClient, groupId: string) =>
  call<GroupDetailRow | GroupDetailRow[]>(c, 'group_detail', { p_group_id: groupId })

export const groupBoard = (c: GroupsClient, groupId: string) =>
  call<GroupBoardDbRow[]>(c, 'group_board', { p_group_id: groupId })

export const groupWall = (c: GroupsClient, groupId: string, cursor: GroupWallCursor | null, limit: number) =>
  call<GroupWallDbRow[]>(c, 'group_wall', {
    p_group_id: groupId,
    p_before: cursor ? cursor.before : null,
    p_before_id: cursor ? cursor.beforeId : null,
    p_limit: limit,
  })

export const groupHistory = (c: GroupsClient, groupId: string, limit: number) =>
  call<GroupHistoryDbRow[]>(c, 'group_history', { p_group_id: groupId, p_limit: limit })

export const groupWeekDetail = (c: GroupsClient, groupId: string, weekStart: string) =>
  call<GroupWeekDetailDbRow[]>(c, 'group_week_detail', { p_group_id: groupId, p_week_start: weekStart })

// cron (service role only) ---------------------------------------------------------------------------------------------

/** Number of weeks closed. Only the cron route calls this, and only with the service role. */
export const closeDueGroupWeeks = (c: GroupsClient) => call<number>(c, 'close_due_group_weeks')

/** "function ... does not exist": the migration is not in this database yet (PostgREST PGRST202 or Postgres 42883). */
export function isMissingFunction(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === 'PGRST202' || error.code === '42883') return true
  return /function .* does not exist|could not find the function/i.test(error.message ?? '')
}
