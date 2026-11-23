import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { HabitForm } from "@/components/HabitForm";
import { TopBar } from "@/components/ui/TopBar";
import { toHabitColor } from "@/domain/habit-colors";
import { quantityConfigOf } from "@/domain/today";
import type { HabitDraft, IconKey, PresetKey, Visibility } from "@/domain/presets";
import { read, readRows } from "@/lib/read";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/viewer";

const QUANTITY_LOCKED =
  "Este hábito está en un reto: puedes subir la meta, no bajarla ni cambiar la unidad.";

export const metadata: Metadata = { title: "Editar hábito" };

export default async function EditarHabitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const habit = read(await supabase
    .from("habits")
    .select(
      "id,name,icon,visibility,requires_photo,frequency_type,target_per_week,preset,color,log_type,quantity_unit,quantity_label,quantity_target,quantity_step,quantity_display,glass_ml",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle());
  if (!habit) notFound();
  const [itemsRes, inChallenge] = await Promise.all([
    supabase
      .from("habit_items")
      .select("label,requires_photo,position")
      .eq("habit_id", id)
      .is("archived_at", null)
      .order("position"),
    // a quantity habit in a proposed or active challenge keeps its unit and cannot lower its goal
    habit.log_type === "quantity"
      ? supabase
          .from("challenges")
          .select("id", { count: "exact", head: true })
          .in("status", ["proposed", "active"])
          .or(`creator_habit_id.eq.${id},rival_habit_id.eq.${id}`)
      : Promise.resolve({ count: 0 }),
  ]);

  const draft: HabitDraft = {
    name: habit.name,
    icon: habit.icon as IconKey,
    frequency:
      habit.frequency_type === "weekly"
        ? { type: "weekly", target: habit.target_per_week ?? 1 }
        : { type: "daily" },
    requiresPhoto: habit.requires_photo,
    items: readRows(itemsRes).map((i) => ({ label: i.label, requiresPhoto: i.requires_photo })),
    visibility: habit.visibility as Visibility,
    logType: habit.log_type as HabitDraft["logType"],
    preset: habit.preset as PresetKey | null,
    color: toHabitColor(habit.color),
    quantity: quantityConfigOf(habit),
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref={`/habitos/${id}`} />
      <h1 className="text-display font-semibold text-ink">Editar hábito</h1>
      <HabitForm
        initial={draft}
        habitId={id}
        quantityLockedReason={(inChallenge.count ?? 0) > 0 ? QUANTITY_LOCKED : null}
      />
    </main>
  );
}
