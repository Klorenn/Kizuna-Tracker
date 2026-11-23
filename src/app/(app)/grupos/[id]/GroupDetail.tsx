"use client";

import { useRouter } from "next/navigation";
import { archive, createInvite, leave, loadMoreWall, loadWeek, removeMember, setAdmin, setCommitment, update } from "@/app/(app)/grupos/actions";
import { GroupDetailView } from "@/components/groups/detail/GroupDetailView";
import type { GroupBoardRow, GroupDetail as Detail, GroupWallPage, GroupWeek } from "@/lib/groups-contract";

const ACTIONS = { update, setCommitment, archive, createInvite, leave, removeMember, setAdmin, loadMoreWall, loadWeek };

/**
 * Binds the actions to the detail view. Every action revalidates this page, so the views' local
 * overlays are replaced by the real data on the next props. After leaving, go back to the list.
 */
export function GroupDetail(props: {
  detail: Detail;
  board: GroupBoardRow[] | null;
  wall: GroupWallPage | null;
  history: GroupWeek[] | null;
  myUserId: string;
  today: string;
}) {
  const router = useRouter();
  return <GroupDetailView {...props} actions={ACTIONS} onLeft={() => router.replace("/grupos")} />;
}
