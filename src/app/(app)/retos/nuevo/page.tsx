import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChallengeForm } from "@/components/ChallengeForm";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { parseNewChallengeParams, parseRivalParam } from "@/lib/challenge-form";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nuevo reto" };

export default async function NuevoRetoPage({
  searchParams,
}: {
  searchParams: Promise<{ habito?: string; amigo?: string }>;
}) {
  const { habito, amigo } = await searchParams;
  const rivalParam = parseRivalParam(amigo);
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");

  const [{ data: friendships }, { data: habits }] = await Promise.all([
    supabase
      .from("friendships")
      .select("requester_id,addressee_id")
      .eq("status", "accepted"),
    supabase
      .from("habits")
      .select("id,name,icon,requires_photo,visibility")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("created_at"),
  ]);

  const friendIds = (friendships ?? []).map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
  const { data: people } = friendIds.length
    ? await supabase.from("public_profiles").select("id,username,display_name").in("id", friendIds)
    : { data: [] };
  const friends = (people ?? []).flatMap((p) =>
    p.id && p.username && p.display_name ? [{ id: p.id, name: p.display_name, username: p.username }] : [],
  );

  const all = habits ?? [];
  const params = parseNewChallengeParams(new URLSearchParams(habito ? { habito } : {}));
  const fromHabit = params.habitId ? all.find((h) => h.id === params.habitId) : undefined;
  const fromFriend = rivalParam ? friends.find((f) => f.id === rivalParam) : undefined;
  const back = fromHabit
    ? { href: `/habitos/${fromHabit.id}`, label: fromHabit.name }
    : fromFriend
      ? { href: `/@${fromFriend.username}`, label: fromFriend.name.split(" ")[0] }
      : { href: "/retos", label: "Retos" };
  const options = all
    .filter((h) => h.visibility !== "private")
    .map((h) => ({ id: h.id, name: h.name, icon: h.icon, requiresPhoto: h.requires_photo }));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <Link href={back.href} className="flex h-11 items-center gap-1 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        {back.label}
      </Link>
      <h1 className="text-display font-semibold text-ink">
        {fromFriend ? `Retar a ${fromFriend.name.split(" ")[0]}` : fromHabit ? "Retar a un amigo" : "Nuevo reto"}
      </h1>

      {fromHabit?.visibility === "private" ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body text-ink">
            Este hábito es solo para ti. Cámbialo a Amigos o Público para retar.
          </p>
          <ButtonLink variant="secondary" href={`/habitos/${fromHabit.id}`}>
            Cambiar visibilidad
          </ButtonLink>
        </Card>
      ) : friends.length === 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body text-ink">Solo puedes retar a tus amigos. Agrega a alguien primero.</p>
          <ButtonLink variant="secondary" href="/amigos">
            Ir a Amigos
          </ButtonLink>
        </Card>
      ) : options.length === 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body text-ink">
            Necesitas un hábito visible para tus amigos (Amigos o Público) para crear un reto.
          </p>
          <ButtonLink variant="secondary" href="/habitos/nuevo">
            Crear hábito
          </ButtonLink>
        </Card>
      ) : (
        <ChallengeForm
          friends={friends}
          habits={options}
          initialHabitId={fromHabit?.id ?? null}
          habitLocked={Boolean(fromHabit)}
          initialRivalId={fromFriend?.id ?? null}
        />
      )}
    </main>
  );
}
