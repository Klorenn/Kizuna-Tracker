"use client";

/**
 * GroupDetailView: the detail of one group (header + Tablero, Muro, Miembros).
 *
 * Props:
 *  - `detail: GroupDetail`
 *  - `board: GroupBoardRow[] | null`, `wall: GroupWallPage | null`, `history: GroupWeek[] | null`
 *    (null = that read failed: its own section shows "No pudimos cargar esto" and a retry link)
 *  - `myUserId: string`
 *  - `actions: Pick<GroupActions, "update" | "setCommitment" | "archive" | "createInvite" | "leave" |
 *    "removeMember" | "setAdmin" | "loadMoreWall" | "loadWeek">`
 *  - `onLeft: () => void` (called after the caller left the group: the page navigates away)
 *  - `today?: string` (optional addition: the viewer's local date "YYYY-MM-DD" for "Hoy"/"Ayer" on the
 *    wall; without it the device's date is used after mount)
 * Members come from `board` (it is the only read that carries roles).
 * The three sections stay mounted while hidden, so each keeps its own state (loaded wall pages,
 * open sheets, scroll) when the control switches. Of other members: name, @usuario, avatar, role,
 * the week's count and, on the wall, the check-in's date and photo. Nothing else.
 */
import { Archive } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { HabitIcon } from "@/components/habit-icon";
import { Segmented } from "@/components/ui/Segmented";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { toHabitColor } from "@/domain/habit-colors";
import type { GroupActions, GroupBoardRow, GroupDetail, GroupWallPage, GroupWeek } from "@/lib/groups-contract";
import { BoardList } from "./BoardList";
import {
  applyDetail,
  applyMembers,
  complianceOf,
  EMPTY_OVERLAY,
  iconKeyOf,
  type Overlay,
} from "./group-logic";
import { HistoryList } from "./HistoryList";
import { MembersList } from "./MembersList";
import { CommitmentText, Mono } from "./parts";
import { WallFeed } from "./WallFeed";

type Section = "board" | "wall" | "members";
const SECTIONS = [
  { value: "board", label: "Tablero" },
  { value: "wall", label: "Muro" },
  { value: "members", label: "Miembros" },
] as const;

type DetailActions = Pick<
  GroupActions,
  "update" | "setCommitment" | "archive" | "createInvite" | "leave" | "removeMember" | "setAdmin" | "loadMoreWall" | "loadWeek"
>;

function Header({ detail, board }: { detail: GroupDetail; board: GroupBoardRow[] | null }) {
  const { complied, counted } = board ? complianceOf(board) : { complied: 0, counted: 0 };
  const pending = detail.pendingCommitment;
  return (
    <header data-habit-color={toHabitColor(detail.color)} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-md bg-(--habit) text-(--habit-on)">
          <HabitIcon name={iconKeyOf(detail.icon)} size={24} />
        </span>
        <h1 className="line-clamp-2 min-w-0 flex-1 break-words text-title font-semibold text-ink">{detail.name}</h1>
      </div>
      {detail.archived ? (
        <p className="flex items-center gap-1.5 text-small text-ink">
          <Archive size={16} weight="light" aria-hidden />
          Este grupo está archivado.
        </p>
      ) : null}
      {detail.description ? <p className="break-words text-body text-muted">{detail.description}</p> : null}
      <div className="flex flex-col gap-1">
        <p className="break-words text-body text-ink">
          <CommitmentText commitment={detail.commitment} />
        </p>
        {pending ? (
          <p className="break-words text-small text-muted">
            Desde el lunes <DayMonth date={pending.effectiveFrom} />: <CommitmentText commitment={pending} />
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 text-small text-muted">
        {detail.streak > 0 ? (
          <p>
            Racha del grupo: <Mono>{detail.streak}</Mono> {detail.streak === 1 ? "semana" : "semanas"}
          </p>
        ) : null}
        {board && counted > 0 ? (
          <p>
            Cumplen <Mono>{complied}</Mono> de <Mono>{counted}</Mono> esta semana
          </p>
        ) : null}
      </div>
    </header>
  );
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "30 nov" with the day in the mono face. */
function DayMonth({ date }: { date: string }) {
  const [, m, d] = date.split("-").map(Number);
  return (
    <>
      <Mono>{d}</Mono> {MONTHS[m - 1]}
    </>
  );
}

export function GroupDetailView({
  detail,
  board,
  wall,
  history,
  myUserId,
  actions,
  onLeft,
  today,
}: {
  detail: GroupDetail;
  board: GroupBoardRow[] | null;
  wall: GroupWallPage | null;
  history: GroupWeek[] | null;
  myUserId: string;
  actions: DetailActions;
  onLeft: () => void;
  today?: string;
}) {
  const [section, setSection] = useState<Section>("board");
  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  // a refresh hands down new data: it replaces what was applied locally (adjust state during render)
  const [seen, setSeen] = useState({ detail, board });
  if (seen.detail !== detail || seen.board !== board) {
    setSeen({ detail, board });
    setOverlay(EMPTY_OVERLAY);
  }

  const view = useMemo(() => applyDetail(detail, overlay), [detail, overlay]);
  const members = useMemo(() => applyMembers(board, overlay), [board, overlay]);
  const retryHref = `/grupos/${detail.id}`;
  const patch = (p: Partial<Overlay>) => setOverlay((o) => ({ ...o, ...p }));

  return (
    <div className="flex flex-col gap-4">
      <Header detail={view} board={members} />
      <Segmented label="Secciones del grupo" options={SECTIONS} value={section} onChange={setSection} />

      <div data-panel="board" hidden={section !== "board"} className="flex flex-col gap-6">
        <section aria-label="Tablero" className="flex flex-col gap-2">
          <SectionHeader label="Esta semana" />
          <BoardList rows={members} myUserId={myUserId} color={view.color} retryHref={retryHref} />
        </section>
        <HistoryList weeks={history} groupId={detail.id} actions={actions} retryHref={retryHref} color={view.color} />
      </div>

      <div data-panel="wall" hidden={section !== "wall"}>
        <WallFeed groupId={detail.id} wall={wall} today={today} actions={actions} retryHref={retryHref} color={view.color} />
      </div>

      <div data-panel="members" hidden={section !== "members"}>
        <MembersList
          detail={view}
          members={members}
          myUserId={myUserId}
          actions={actions}
          retryHref={retryHref}
          onLeft={onLeft}
          onEdited={(fields) => patch({ fields })}
          onCommitmentSet={(c, effectiveFrom) => patch({ pending: { ...c, effectiveFrom } })}
          onArchived={() => patch({ archived: true })}
          onMemberRemoved={(id) => setOverlay((o) => ({ ...o, removed: [...o.removed, id] }))}
          onRoleChanged={(id, role) => setOverlay((o) => ({ ...o, roles: { ...o.roles, [id]: role } }))}
        />
      </div>
    </div>
  );
}
