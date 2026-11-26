import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HabitIcon } from "@/components/habit-icon";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { IconKey } from "@/domain/presets";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/viewer";
import { RestoreButton } from "./RestoreButton";

export const metadata: Metadata = { title: "Hábitos archivados" };

export default async function ArchivedHabitsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("habits")
    .select("id,name,icon")
    .eq("user_id", user.id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  const habits = data ?? [];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <Link href="/perfil/ajustes" className="-ml-1 flex h-11 w-fit items-center gap-1 pr-2 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Ajustes
      </Link>
      <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Archivados</h1>
      {habits.length === 0 ? (
        <Card>
          <EmptyState title="No hay hábitos archivados" body="Cuando archives uno, queda acá con su historial." />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {habits.map((h) => (
            <li key={h.id}>
              <Card className="flex items-center gap-3 p-4">
                <HabitIcon name={h.icon as IconKey} />
                <p className="min-w-0 flex-1 truncate text-body font-medium text-ink">{h.name}</p>
                <RestoreButton id={h.id} name={h.name} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
