import type { Metadata } from "next";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { KanjiWatermark } from "@/components/auth/KanjiWatermark";
import { StepTitle } from "@/components/auth/StepTitle";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión" };

/** Figma B1 / B1e Iniciar sesión (820:2945, 820:2996). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="relative isolate mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-[max(env(safe-area-inset-bottom),24px)]">
      <KanjiWatermark />
      <AuthTopBar backHref="/bienvenida" />
      <StepTitle title="Hola de nuevo" subtitle="Entra con tu correo o tu @usuario." />
      <LoginForm next={next ?? null} profileMissing={error === "perfil"} />
    </main>
  );
}
