import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { HabitForm } from "@/components/HabitForm";
import { TopBar } from "@/components/ui/TopBar";
import { toHabitColor } from "@/domain/habit-colors";
import type { HabitDraft, IconKey, PresetKey, Visibility } from "@/domain/presets";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editar hábito" };

export default async function EditarHabitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: habit } = await supabase
    .from("habits")
    .select("id,name,icon,visibility,requires_photo,frequency_type,target_per_week,preset,color,log_type")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (!habit) notFound();
  const { data: items } = await supabase
    .from("habit_items")
    .select("label,requires_photo,position")
    .eq("habit_id", id)
    .is("archived_at", null)
    .order("position");

  const draft: HabitDraft = {
    name: habit.name,
    icon: habit.icon as IconKey,
    frequency:
      habit.frequency_type === "weekly"
        ? { type: "weekly", target: habit.target_per_week ?? 1 }
        : { type: "daily" },
    requiresPhoto: habit.requires_photo,
    items: (items ?? []).map((i) => ({ label: i.label, requiresPhoto: i.requires_photo })),
    visibility: habit.visibility as Visibility,
    logType: habit.log_type as HabitDraft["logType"],
    preset: habit.preset as PresetKey | null,
    color: toHabitColor(habit.color),
    quantity: null, // TODO(T28): read quantity_* columns once the migration and types exist
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref={`/habitos/${id}`} />
      <h1 className="text-display font-semibold text-ink">Editar hábito</h1>
      <HabitForm initial={draft} habitId={id} />
    </main>
  );
}
