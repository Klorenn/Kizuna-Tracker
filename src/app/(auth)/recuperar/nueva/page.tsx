import type { Metadata } from "next";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { KanjiWatermark } from "@/components/auth/KanjiWatermark";
import { StepTitle } from "@/components/auth/StepTitle";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Contraseña nueva" };

export default function NewPasswordPage() {
  return (
    <main className="relative isolate mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-[max(env(safe-area-inset-bottom),24px)]">
      <KanjiWatermark />
      <AuthTopBar backHref="/login" />
      <StepTitle title="Elige una contraseña" subtitle="Mínimo 8 caracteres." />
      <NewPasswordForm />
    </main>
  );
}
