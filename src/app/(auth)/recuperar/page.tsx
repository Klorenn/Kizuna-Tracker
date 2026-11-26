import type { Metadata } from "next";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { KanjiWatermark } from "@/components/auth/KanjiWatermark";
import { StepTitle } from "@/components/auth/StepTitle";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <main className="relative isolate mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-[max(env(safe-area-inset-bottom),24px)]">
      <KanjiWatermark />
      <AuthTopBar backHref="/login" />
      <StepTitle
        title="Recuperar contraseña"
        subtitle="Te enviamos un enlace si hay una cuenta con ese correo."
      />
      <ResetForm />
    </main>
  );
}
