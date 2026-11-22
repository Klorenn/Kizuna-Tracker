import type { Metadata } from "next";
import { Lockup } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Bienvenida" };

export default function BienvenidaPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-32">
      <section className="flex flex-col gap-4">
        <Lockup />
        <h1 className="text-title font-semibold text-ink">
          Rachas y retos con tus amigos.
        </h1>
        <p className="text-body text-muted">
          Marca tus hábitos, sube una foto cuando toca y lleva la cuenta de las
          multas entre amigos.
        </p>
      </section>
      <div className="mt-auto flex flex-col gap-3 pt-8">
        <ButtonLink href="/registro">Crear cuenta</ButtonLink>
        <ButtonLink href="/login" variant="secondary">
          Ya tengo cuenta
        </ButtonLink>
        <p className="text-center text-small text-muted">
          Al continuar aceptas los Términos de uso y la Política de privacidad.
        </p>
      </div>
    </main>
  );
}
