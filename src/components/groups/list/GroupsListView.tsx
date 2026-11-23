"use client";

import { CaretRight, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CatMark } from "@/components/brand/CatMark";
import { LoadFailed } from "@/components/LoadFailed";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { toHabitColor } from "@/domain/habit-colors";
import { GROUP_LIMITS, type GroupSummary } from "@/lib/groups-contract";
import { cardLines, commitmentLine } from "./format";
import { JoinLinkForm } from "./JoinLinkForm";
import { resolveJoinLink } from "./parse-invite";
import { GroupIconTile, NumText } from "./parts";

/**
 * Props:
 *  - groups: GroupSummary[] | null (null = the read failed)
 *  - canCreate: boolean (false hides "Crear grupo" and says why)
 *  - hrefs: where it links to; defaults to /grupos/nuevo, /grupos/<id>, /grupos/unirse/<code>
 *  - retryHref: LoadFailed's retry link (default /grupos)
 *  - navigate: opens a route from the "Tengo un enlace" sheet (default: router.push)
 * The Retos | Grupos switch is not part of this view: the page places it.
 */
export type GroupsListHrefs = {
  create: string;
  group: (id: string) => string;
  join: (code: string) => string;
};

export const DEFAULT_GROUPS_HREFS: GroupsListHrefs = {
  create: "/grupos/nuevo",
  group: (id) => `/grupos/${id}`,
  join: (code) => `/grupos/unirse/${code}`,
};

function GroupCard({ group, href }: { group: GroupSummary; href: string }) {
  const lines = cardLines(group);
  const muted = group.archived;
  return (
    <Link href={href} className="block rounded-lg">
      <Card accent={!muted} accentColor={toHabitColor(group.color)} className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <GroupIconTile icon={group.icon} color={group.color} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className={`truncate text-body font-semibold ${muted ? "text-muted" : "text-ink"}`}>
              {group.name}
            </p>
            <p className="truncate text-small text-muted">
              <NumText>{commitmentLine(group.commitment)}</NumText>
            </p>
          </div>
          <CaretRight size={20} weight="light" className="shrink-0 text-muted" aria-hidden />
        </div>
        {muted ? (
          <p className="text-small text-muted">Archivado</p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-small text-ink">
              <NumText>{lines.week}</NumText>
            </p>
            <p className="text-small text-ink">
              <NumText>{lines.mine}</NumText>
            </p>
            {lines.streak ? (
              <p className="text-small text-muted">
                <NumText>{lines.streak}</NumText>
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </Link>
  );
}

export function GroupsListView({
  groups,
  canCreate,
  hrefs = DEFAULT_GROUPS_HREFS,
  retryHref = "/grupos",
  navigate,
}: {
  groups: GroupSummary[] | null;
  canCreate: boolean;
  hrefs?: GroupsListHrefs;
  retryHref?: string;
  navigate?: (href: string) => void;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open() {
    if (busy) return;
    const r = resolveJoinLink(value, hrefs.join);
    if (!r.ok) return setError(r.error);
    setError(null);
    setBusy(true);
    if (navigate) navigate(r.href);
    else router.push(r.href);
  }

  const active = (groups ?? []).filter((g) => !g.archived);
  const archived = (groups ?? []).filter((g) => g.archived);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Grupos</h1>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {canCreate ? (
            <ButtonLink href={hrefs.create}>
              <Plus size={20} weight="light" aria-hidden />
              Crear grupo
            </ButtonLink>
          ) : null}
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Tengo un enlace
          </Button>
        </div>
        {canCreate ? null : (
          <p className="text-small text-muted">
            Ya estás en {GROUP_LIMITS.groupsPerPerson} grupos. Sal de uno para crear otro.
          </p>
        )}
      </div>

      {groups === null ? <LoadFailed href={retryHref} /> : null}

      {groups !== null && groups.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 px-6 py-8 text-center">
          <CatMark width={101} />
          <p className="text-body text-muted">
            Todavía no estás en ningún grupo. Crea uno o entra con un enlace de invitación.
          </p>
        </Card>
      ) : null}

      {active.map((g) => (
        <GroupCard key={g.id} group={g} href={hrefs.group(g.id)} />
      ))}

      {archived.length > 0 ? (
        <>
          <SectionHeader label="Archivados" />
          {archived.map((g) => (
            <GroupCard key={g.id} group={g} href={hrefs.group(g.id)} />
          ))}
        </>
      ) : null}

      <Sheet
        open={sheet}
        title="Tengo un enlace"
        onClose={() => {
          setSheet(false);
          setBusy(false);
        }}
      >
        <JoinLinkForm
          value={value}
          error={error}
          busy={busy}
          onChange={(v) => {
            setValue(v);
            setError(null);
          }}
          onSubmit={open}
        />
      </Sheet>
    </div>
  );
}
