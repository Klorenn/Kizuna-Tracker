import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PhotoCheckinFlow } from "@/components/PhotoCheckinFlow";
import type { LogType } from "@/domain/logs";
import type { PresetKey } from "@/domain/presets";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";

export const metadata: Metadata = { title: "Foto del día" };

export default async function FotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paso?: string }>;
}) {
  const { id } = await params;
  const { paso } = await searchParams;
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const profile = await getViewerProfile();
  if (!profile) redirect("/login?error=perfil");

  const { data: habit } = await supabase
    .from("habits")
    .select("id,name,preset,requires_photo,log_type")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (!habit) notFound();

  let itemId: string | null = null;
  if (paso) {
    const { data: item } = await supabase
      .from("habit_items")
      .select("id")
      .eq("id", paso)
      .eq("habit_id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (!item) notFound();
    itemId = item.id;
  } else if (!habit.requires_photo) {
    notFound();
  }

  return (
    <PhotoCheckinFlow
      habitId={habit.id}
      itemId={itemId}
      title={habit.name}
      preset={habit.preset as PresetKey | null}
      logType={habit.log_type as LogType}
      timeZone={profile.timezone}
    />
  );
}
