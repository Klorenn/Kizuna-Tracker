/**
 * Groups: the types shared by the data layer, the server actions and the views.
 * Types and constants only. Do not add logic here.
 */

export const GROUP_LIMITS = {
  members: 50,
  groupsPerPerson: 10,
  admins: 3,
  invites: 5,
  nameMin: 3,
  nameMax: 40,
  descriptionMax: 140,
  commitmentMax: 40,
  targetMin: 1,
  targetMax: 7,
} as const;

export type GroupRole = "admin" | "member";

/** A local calendar date, "YYYY-MM-DD". */
export type GroupDate = string;

export type GroupCommitment = {
  name: string;
  /** A habit icon key. */
  icon: string;
  targetPerWeek: number;
  requiresPhoto: boolean;
};

export type GroupSummary = {
  id: string;
  name: string;
  /** A habit icon key. */
  icon: string;
  /** A habit colour key. */
  color: string;
  role: GroupRole;
  memberCount: number;
  commitment: GroupCommitment;
  /** The caller's habit linked to this group. */
  myHabitId: string;
  myDone: number;
  /** False until the caller's first counted week starts. */
  myCounts: boolean;
  compliedCount: number;
  countedCount: number;
  streak: number;
  archived: boolean;
};

export type GroupDetail = {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  commitment: GroupCommitment;
  pendingCommitment: (GroupCommitment & { effectiveFrom: GroupDate }) | null;
  role: GroupRole;
  myHabitId: string;
  streak: number;
  memberCount: number;
  archived: boolean;
};

export type GroupPerson = {
  userId: string;
  username: string;
  displayName: string;
  avatarPath: string | null;
  avatarPreset: number | null;
};

export type GroupBoardRow = GroupPerson & {
  role: GroupRole;
  joinedOn: GroupDate;
  counts: boolean;
  done: number;
  target: number;
};

export type GroupWallItem = GroupPerson & {
  checkinId: string;
  localDate: GroupDate;
  photoPath: string | null;
  createdAt: string;
};

export type GroupWallCursor = { before: string; beforeId: string };

export type GroupWallPage = { items: GroupWallItem[]; next: GroupWallCursor | null };

export type GroupWeek = {
  weekStart: GroupDate;
  targetPerWeek: number;
  requiresPhoto: boolean;
  membersCounted: number;
  membersComplied: number;
  /** Null when the caller was not counted that week. */
  myComplied: boolean | null;
};

export type GroupWeekRow = GroupPerson & { done: number; target: number; complied: boolean };

export type GroupInvitePreview = {
  name: string;
  icon: string;
  color: string;
  commitment: GroupCommitment;
  memberCount: number;
  full: boolean;
};

/** How the person takes part: a new habit copied from the commitment, or one of theirs. */
export type GroupHabitChoice = { kind: "create" } | { kind: "habit"; habitId: string };

export type GroupDraft = {
  name: string;
  icon: string;
  color: string;
  description: string;
  commitment: GroupCommitment;
  habit: GroupHabitChoice;
};

export type GroupLoaded<T> = { ok: true; data: T } | { ok: false; error: string; notFound?: true };

export type GroupResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Server actions as the views receive them (passed down as props by the pages). */
export type GroupActions = {
  create: (draft: GroupDraft) => Promise<GroupResult<{ id: string }>>;
  update: (
    groupId: string,
    fields: { name: string; icon: string; color: string; description: string },
  ) => Promise<GroupResult>;
  setCommitment: (
    groupId: string,
    commitment: GroupCommitment,
  ) => Promise<GroupResult<{ effectiveFrom: GroupDate }>>;
  archive: (groupId: string) => Promise<GroupResult>;
  createInvite: (groupId: string) => Promise<GroupResult<{ code: string; url: string }>>;
  join: (code: string, habit: GroupHabitChoice) => Promise<GroupResult<{ id: string }>>;
  leave: (groupId: string) => Promise<GroupResult>;
  removeMember: (groupId: string, userId: string) => Promise<GroupResult>;
  setAdmin: (groupId: string, userId: string, admin: boolean) => Promise<GroupResult>;
  loadMoreWall: (groupId: string, cursor: GroupWallCursor) => Promise<GroupResult<GroupWallPage>>;
  loadWeek: (groupId: string, weekStart: GroupDate) => Promise<GroupResult<GroupWeekRow[]>>;
};
