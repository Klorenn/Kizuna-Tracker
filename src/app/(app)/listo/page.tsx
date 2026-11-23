import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CatJump } from "@/components/brand/CatJump";
import { ButtonLink } from "@/components/ui/Button";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Listo" };

export default async function ListoPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/login?error=perfil");

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] w-full max-w-md flex-col px-5 pt-24">
      <div className="flex justify-center">
        <CatJump width={112} once />
      </div>
      <section className="mt-10 flex flex-col gap-2">
        <h1 className="text-display font-semibold text-ink">
          Listo, @{profile.username}
        </h1>
        <p className="text-body text-muted">
          Tu cuenta está creada. El siguiente paso es tu primer hábito.
        </p>
      </section>
      <div className="mt-auto pb-6">
        <ButtonLink href="/">Empezar</ButtonLink>
      </div>
    </main>
  );
}
