import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LoadFailed } from "@/components/LoadFailed";
import { localDate } from "@/domain/dates";
import { groupPageNotFound } from "@/domain/group-invite";
import { initialSection, isJustJoined } from "@/components/groups/detail/fines-wiring";
import { loadGroupBoard, loadGroupDetail, loadGroupHistory, loadGroupWall } from "@/lib/groups-data";
import { loadGroupFineState, loadGroupFund, loadGroupRejected } from "@/lib/groups-fines-data";
import { signProofUrls } from "@/lib/sign-proofs";
import { createServerClient } from "@/lib/supabase/server";
import { getViewer, viewerMissingDestination } from "@/lib/viewer";
import { GroupDetail } from "./GroupDetail";

export const metadata: Metadata = { title: "Grupo" };

export default async function GrupoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seccion?: string | string[]; unido?: string | string[] }>;
}) {
  const { id } = await params;
  const { seccion, unido } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(await viewerMissingDestination());
  const supabase = await createServerClient();

  // one round, seven reads: each section of the view handles its own failed read. The fine's reads never decide the 404
  // (the four group reads do): a failed fine read is an error inside "Fondo" only.
  // The photo signing chains off the wall read inside the same round (one batched, user-scoped call, so storage RLS applies):
  // it adds no serial step. A failed wall read signs nothing, so a stranger's 404 is unchanged.
  const [detail, board, wallSigned, history, fineState, fund, rejected] = await Promise.all([
    loadGroupDetail(id, supabase),
    loadGroupBoard(id, supabase),
    loadGroupWall(id, null, undefined, supabase).then(async (wall) => ({
      wall,
      signedUrls: wall.ok
        ? await signProofUrls(supabase, wall.data.items.flatMap((i) => (i.photoPath ? [i.photoPath] : [])))
        : {},
      signedAt: Date.now(),
    })),
    loadGroupHistory(id, undefined, supabase),
    loadGroupFineState(id, supabase),
    loadGroupFund(id, supabase),
    loadGroupRejected(id, supabase),
  ]);
  const { wall, signedUrls, signedAt } = wallSigned;
  // a stranger (or an id that is not a group) gets the same 404 whichever read answered first
  if (groupPageNotFound([detail, board, wall, history])) notFound();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <Link href="/grupos" className="-ml-1 flex h-11 w-fit items-center gap-1 pr-2 text-body text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Grupos
      </Link>
      {detail.ok ? (
        <GroupDetail
          detail={detail.data}
          board={board.ok ? board.data : null}
          wall={wall.ok ? wall.data : null}
          history={history.ok ? history.data : null}
          fineState={fineState.ok ? fineState.data : null}
          fund={fund.ok ? fund.data : null}
          rejected={rejected.ok ? rejected.data : null}
          now={Date.now()}
          initialSection={initialSection(seccion, true)}
          justJoined={isJustJoined(unido)}
          myUserId={viewer.id}
          today={localDate(new Date(), viewer.timezone)}
          signedUrls={signedUrls}
          signedAt={signedAt}
        />
      ) : (
        <LoadFailed href={`/grupos/${id}`} />
      )}
    </main>
  );
}
