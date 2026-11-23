import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoadFailed } from "@/components/LoadFailed";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { canCreateGroup, eligibleGroupHabits, linkedHabitIds } from "@/domain/group-habits";
import { loadHabitCandidates } from "@/lib/group-habits-data";
import { GROUP_LIMITS } from "@/lib/groups-contract";
import { loadMyGroups } from "@/lib/groups-data";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/viewer";
import { NewGroup } from "./NewGroup";

export const metadata: Metadata = { title: "Nuevo grupo" };

export default async function NuevoGrupoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const supabase = await createServerClient();

  const [groups, candidates] = await Promise.all([loadMyGroups(supabase), loadHabitCandidates(user.id, supabase)]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <Link href="/grupos" className="-ml-1 flex h-11 w-fit items-center gap-1 pr-2 text-body text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Grupos
      </Link>
      <h1 className="text-display font-semibold text-ink">Nuevo grupo</h1>

      {!groups.ok || !candidates.ok ? (
        <LoadFailed href="/grupos/nuevo" />
      ) : !canCreateGroup(groups.data) ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body text-ink">
            Ya estás en {GROUP_LIMITS.groupsPerPerson} grupos. Sal de uno para crear otro.
          </p>
          <ButtonLink variant="secondary" href="/grupos">
            Ir a Grupos
          </ButtonLink>
        </Card>
      ) : (
        // the group's photo rule is chosen in the form, so the photo condition is the database's to check
        <NewGroup habits={eligibleGroupHabits(candidates.data, linkedHabitIds(groups.data))} />
      )}
    </main>
  );
}
