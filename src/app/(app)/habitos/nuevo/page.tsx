import type { Metadata } from "next";
import { HabitForm } from "@/components/HabitForm";
import { TopBar } from "@/components/ui/TopBar";
import { customDraft } from "@/domain/presets";

export const metadata: Metadata = { title: "Nuevo hábito" };

export default function NuevoHabitoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref="/" />
      <h1 className="text-display font-semibold text-ink">Nuevo hábito</h1>
      <HabitForm initial={customDraft()} />
    </main>
  );
}
