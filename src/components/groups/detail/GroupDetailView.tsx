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
 *  - `fines?: GroupFines` (optional addition: the optional fine. With it the view gains "Fondo" after Miembros (admins
 *    always; a member when there is a fine, a proposal or a debt), "Rechazar foto" on the wall and "Fotos rechazadas";
 *    `null` in `state`/`fund`/`rejected` = that read failed. `now` is the page's clock)
 *  - `initialSection?: GroupSection` (optional addition: the section open first, from `?seccion=`)
 *  - `today?: string` (optional addition: the viewer's local date "YYYY-MM-DD" for "Hoy"/"Ayer" on the
 *    wall; without it the device's date is used after mount)
 * Members come from `board` (it is the only read that carries roles).
 * The sections stay mounted while hidden, so each keeps its own state (loaded wall pages,
 * open sheets, scroll) when the control switches. Of other members: name, @usuario, avatar, role,
 * the week's count and, on the wall, the check-in's date and photo. Nothing else.
 */
import { Archive } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { FundSection } from "@/components/groups/fund/FundSection";
import { JoinFineQuestion } from "@/components/groups/fund/JoinFineQuestion";
import { RejectedList } from "@/components/groups/reject/RejectedList";
import { HabitIcon } from "@/components/habit-icon";
import { Segmented } from "@/components/ui/Segmented";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { toHabitColor } from "@/domain/habit-colors";
import type { GroupActions, GroupBoardRow, GroupDetail, GroupWallPage, GroupWeek } from "@/lib/groups-contract";
import type { GroupFineActions, GroupFineState, GroupFund, GroupRejectedItem } from "@/lib/groups-fines-contract";
import { BoardList } from "./BoardList";
import {
  applyDetail,
  applyMembers,
  complianceOf,
  EMPTY_OVERLAY,
  iconKeyOf,
  type Overlay,
} from "./group-logic";
import { type GroupSection, joinQuestionVisible, showFundSection, showRejectedList } from "./fines-wiring";
import { HistoryList } from "./HistoryList";
import { MembersList } from "./MembersList";
import { CommitmentText, Mono } from "./parts";
import { WallFeed } from "./WallFeed";

const SECTIONS: readonly { value: GroupSection; label: string }[] = [
  { value: "board", label: "Tablero" },
  { value: "wall", label: "Muro" },
  { value: "members", label: "Miembros" },
];
const FUND_SECTION: { value: GroupSection; label: string } = { value: "fund", label: "Fondo" };

/** The optional fine's reads and actions, handed down by the page. */
export type GroupFines = {
  state: GroupFineState | null;
  fund: GroupFund | null;
  rejected: GroupRejectedItem[] | null;
  now: number;
  actions: GroupFineActions;
  onChanged: () => void | Promise<void>;
};

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
  fines,
  initialSection = "board",
  justJoined = false,
}: {
  detail: GroupDetail;
  board: GroupBoardRow[] | null;
  wall: GroupWallPage | null;
  history: GroupWeek[] | null;
  myUserId: string;
  actions: DetailActions;
  onLeft: () => void;
  today?: string;
  fines?: GroupFines;
  initialSection?: GroupSection;
  /** Arrived from joining (`?unido=1`): a fine in force is put to the person as a question. */
  justJoined?: boolean;
}) {
  // "fund" is opened only when the section exists for this person: otherwise it would appear on its own after a refresh
  const [section, setSection] = useState<GroupSection>(() =>
    initialSection === "fund" &&
    !(fines && showFundSection({ role: detail.role, archived: detail.archived, state: fines.state, fund: fines.fund }))
      ? "board"
      : initialSection,
  );
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

  const fundShown = fines ? showFundSection({ role: view.role, archived: view.archived, state: fines.state, fund: fines.fund }) : false;
  const current: GroupSection = section === "fund" && !fundShown ? "board" : section;
  const reject = useMemo(
    () =>
      fines
        ? {
            groupId: detail.id,
            myUserId,
            role: view.role,
            archived: view.archived,
            requiresPhoto: view.commitment.requiresPhoto,
            now: fines.now,
            actions: fines.actions,
            onRejected: () => void fines.onChanged(),
          }
        : undefined,
    [fines, detail.id, myUserId, view.role, view.archived, view.commitment.requiresPhoto],
  );

  return (
    <div className="flex flex-col gap-4">
      <Header detail={view} board={members} />
      <Segmented
        label="Secciones del grupo"
        options={fundShown ? [...SECTIONS, FUND_SECTION] : SECTIONS}
        value={current}
        onChange={setSection}
      />

      <div data-panel="board" hidden={current !== "board"} className="flex flex-col gap-6">
        <section aria-label="Tablero" className="flex flex-col gap-2">
          <SectionHeader label="Esta semana" />
          <BoardList rows={members} myUserId={myUserId} color={view.color} retryHref={retryHref} />
        </section>
        <HistoryList weeks={history} groupId={detail.id} actions={actions} retryHref={retryHref} color={view.color} />
      </div>

      <div data-panel="wall" hidden={current !== "wall"} className="flex flex-col gap-4">
        {fines && showRejectedList({ role: view.role, items: fines.rejected, requiresPhoto: view.commitment.requiresPhoto }) ? (
          <RejectedList
            groupId={detail.id}
            items={fines.rejected}
            role={view.role}
            ownerView={view.role !== "admin"}
            archived={view.archived}
            retryHref={retryHref}
            actions={fines.actions}
            onUndone={() => void fines.onChanged()}
          />
        ) : null}
        <WallFeed
          groupId={detail.id}
          wall={wall}
          today={today}
          actions={actions}
          retryHref={retryHref}
          color={view.color}
          reject={reject}
        />
      </div>

      <div data-panel="members" hidden={current !== "members"}>
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

      {fines && fundShown ? (
        <div data-panel="fund" hidden={current !== "fund"} className="flex flex-col gap-3">
          {joinQuestionVisible({ justJoined, state: fines.state }) && fines.state?.active ? (
            <JoinFineQuestion
              groupId={detail.id}
              amount={fines.state.active.amount}
              purpose={fines.state.active.purpose}
              acceptActive={fines.actions.acceptActive}
              onAccepted={fines.onChanged}
            />
          ) : null}
          <FundSection
            groupId={detail.id}
            state={fines.state}
            fund={fines.fund}
            role={view.role}
            archived={view.archived}
            myUserId={myUserId}
            retryHref={retryHref}
            now={fines.now}
            actions={fines.actions}
            onChanged={fines.onChanged}
          />
        </div>
      ) : null}
    </div>
  );
}
