import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LoadFailed } from "@/components/LoadFailed";
import { localDate } from "@/domain/dates";
import { groupPageNotFound } from "@/domain/group-invite";
import { loadGroupBoard, loadGroupDetail, loadGroupHistory, loadGroupWall } from "@/lib/groups-data";
import { createServerClient } from "@/lib/supabase/server";
import { getViewer, viewerMissingDestination } from "@/lib/viewer";
import { GroupDetail } from "./GroupDetail";

export const metadata: Metadata = { title: "Grupo" };

export default async function GrupoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(await viewerMissingDestination());
  const supabase = await createServerClient();

  // one round, four reads: each section of the view handles its own failed read
  const [detail, board, wall, history] = await Promise.all([
    loadGroupDetail(id, supabase),
    loadGroupBoard(id, supabase),
    loadGroupWall(id, null, undefined, supabase),
    loadGroupHistory(id, undefined, supabase),
  ]);
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
          myUserId={viewer.id}
          today={localDate(new Date(), viewer.timezone)}
        />
      ) : (
        <LoadFailed href={`/grupos/${id}`} />
      )}
    </main>
  );
}
