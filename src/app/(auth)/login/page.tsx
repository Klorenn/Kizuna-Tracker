import type { Metadata } from "next";
import { TopBar } from "@/components/ui/TopBar";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pt-3">
      <TopBar backHref="/bienvenida" />
      <h1 className="text-heading font-semibold text-ink">Hola de nuevo</h1>
      <LoginForm next={next ?? null} profileMissing={error === "perfil"} />
    </main>
  );
}
