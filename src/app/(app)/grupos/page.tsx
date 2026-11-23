import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GroupsListView } from "@/components/groups/list/GroupsListView";
import { RetosGruposSwitch } from "@/components/groups/RetosGruposSwitch";
import { canCreateGroup } from "@/domain/group-habits";
import { loadMyGroups } from "@/lib/groups-data";
import { getSessionUser } from "@/lib/viewer";

export const metadata: Metadata = { title: "Grupos" };

export default async function GruposPage() {
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");

  const groups = await loadMyGroups();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <RetosGruposSwitch current="grupos" />
      {/* a failed read is an error state (null), never the empty list; the create page checks the limit again */}
      <GroupsListView groups={groups.ok ? groups.data : null} canCreate={groups.ok ? canCreateGroup(groups.data) : true} />
    </main>
  );
}
