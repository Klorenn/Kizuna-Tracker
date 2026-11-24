"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { archive, createInvite, leave, loadMoreWall, loadWeek, removeMember, setAdmin, setCommitment, update } from "@/app/(app)/grupos/actions";
import { acceptActive, end, propose, rejectPhoto, setDebtPaid, stepOut, undoRejectPhoto, vote } from "@/app/(app)/grupos/fines-actions";
import type { GroupSection } from "@/components/groups/detail/fines-wiring";
import { GroupDetailView } from "@/components/groups/detail/GroupDetailView";
import type { GroupBoardRow, GroupDetail as Detail, GroupWallPage, GroupWeek } from "@/lib/groups-contract";
import type { GroupFineState, GroupFund, GroupRejectedItem } from "@/lib/groups-fines-contract";

const ACTIONS = { update, setCommitment, archive, createInvite, leave, removeMember, setAdmin, loadMoreWall, loadWeek };
const FINE_ACTIONS = { propose, vote, acceptActive, stepOut, end, setDebtPaid, rejectPhoto, undoRejectPhoto };

/**
 * Binds the actions to the detail view. Every action revalidates this page, so the views' local
 * overlays are replaced by the real data on the next props. After leaving, go back to the list.
 * The fine's actions refresh the page (`router.refresh()`), and the fund section ends its "Actualizando…" with it.
 */
export function GroupDetail(props: {
  detail: Detail;
  board: GroupBoardRow[] | null;
  wall: GroupWallPage | null;
  history: GroupWeek[] | null;
  /** The fine's reads (null = that read failed) and the server's clock. */
  fineState: GroupFineState | null;
  fund: GroupFund | null;
  rejected: GroupRejectedItem[] | null;
  now: number;
  initialSection: GroupSection;
  justJoined: boolean;
  myUserId: string;
  today: string;
  /** Wall photo URLs signed on the server (path -> URL). */
  signedUrls?: Record<string, string>;
  /** Date.now() when the server signed them. */
  signedAt?: number;
}) {
  const router = useRouter();
  const { fineState, fund, rejected, now, ...rest } = props;
  const fines = useMemo(
    () => ({ state: fineState, fund, rejected, now, actions: FINE_ACTIONS, onChanged: () => router.refresh() }),
    [fineState, fund, rejected, now, router],
  );
  return <GroupDetailView {...rest} actions={ACTIONS} fines={fines} onLeft={() => router.replace("/grupos")} />;
}
